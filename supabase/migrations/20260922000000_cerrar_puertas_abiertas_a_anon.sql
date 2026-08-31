-- Cerrar lo que quedaba abierto al rol `anon`.
--
-- DE DÓNDE SALE ESTO
-- Una segunda revisión, hecha contra la base EN VIVO (no contra estos
-- archivos), encontró cosas que mi auditoría no podía ver. Dos causas
-- distintas, y las dos importan:
--
--   1. Yo revisé los permisos de ejecución solo de las funciones del PIN.
--      No se me ocurrió revisar TODAS. `admin_delete_negocios_data` estaba
--      abierta a `anon`. Eso es un error mío, no una limitación.
--
--   2. La base de producción tiene objetos que NO están en estas
--      migraciones: policies y funciones creadas a mano desde el panel de
--      Supabase antes de que existiera este directorio. Levantando una base
--      limpia desde los archivos, esas cosas simplemente no aparecen.
--
-- Por lo segundo, TODO en este archivo está escrito para no saber qué hay:
-- si un objeto no existe, se salta en silencio en vez de tumbar la
-- migración completa.


-- ============================================================================
-- 1. CRÍTICO — cualquiera podía borrar cualquier negocio, sin login
-- ============================================================================
-- `admin_delete_negocios_data(uuid[])` es `security definer` (corre como
-- dueño de la base, se salta RLS) y por dentro NO tiene ni un solo control
-- de acceso: recorre las tablas hijas, borra todo, y al final
-- `delete from negocios`.
--
-- El código la llama bien, solo desde /api/admin/* con service_role. Pero
-- Supabase publica toda función de `public` en /rest/v1/rpc/, y `anon` tenía
-- EXECUTE. La cadena completa era:
--
--   1. sacar la llave pública del JavaScript del sitio (va ahí por diseño)
--   2. tomar el slug de un negocio (está en la URL /b/[slug])
--   3. negocio_publico_por_slug(slug) -> te da el id
--   4. admin_delete_negocios_data([id]) -> el negocio y todo su historial
--
-- Sin rate limit, y en lote. Un cliente perdía su negocio entero.
--
-- Se le quita el permiso a anon y a authenticated. Nadie legítimo la llama
-- con esas llaves: service_role no pierde el permiso (los dueños de objeto y
-- los superusuarios no dependen de los GRANT).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_delete_negocios_data'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    -- El GRANT explícito a service_role NO es adorno. `revoke ... from
    -- public` quita el permiso implícito que tienen TODOS los roles; si en
    -- alguna base el acceso de service_role viniera de ahí y no de un grant
    -- propio, esta misma línea le quitaría el permiso a las rutas de /admin
    -- y borrar un negocio dejaría de funcionar para ti. Se lo devolvemos
    -- explícito y ya no depende de cómo esté configurada la base.
    execute format('grant execute on function %s to service_role', f.firma);
    raise notice 'permiso retirado a anon/authenticated en %', f.firma;
  end loop;
end $$;


-- ============================================================================
-- 2. CRÍTICO — los correos de todos los usuarios eran públicos
-- ============================================================================
-- La tabla `profiles` arrastra policies viejas y permisivas, de cuando se
-- configuró a mano desde el panel: "Allow all for profiles" (ALL, using
-- true), "Enable read", "Enable insert", "Enable update".
--
-- Postgres combina las policies permisivas con OR: basta UNA que diga `true`
-- para que las buenas (profiles_self_select, etc.) no sirvan de nada. Con la
-- llave pública se podía leer la tabla entera con todos los correos.
--
-- No están en estas migraciones — por eso no las vi. Se borran por nombre,
-- con `if exists`, y quedan solo las tres correctas:
--   profiles_self_select · profiles_self_update · profiles_admin_all
--
-- La escalada de privilegios NO estaba abierta: el trigger
-- profiles_privileged_fields_guard ya impide cambiarse el rol. El problema
-- era de lectura.
drop policy if exists "Allow all for profiles" on public.profiles;
drop policy if exists "Enable read" on public.profiles;
drop policy if exists "Enable insert" on public.profiles;
drop policy if exists "Enable update" on public.profiles;
drop policy if exists "Enable delete" on public.profiles;
-- Variantes con las que Supabase bautiza las policies hechas desde el panel.
drop policy if exists "Enable read access for all users" on public.profiles;
drop policy if exists "Enable insert for all users" on public.profiles;
drop policy if exists "Enable update for all users" on public.profiles;
drop policy if exists "Enable read access to all users" on public.profiles;
drop policy if exists "Enable insert for authenticated users only" on public.profiles;

-- Red de seguridad: si quedó alguna otra policy permisiva en profiles que no
-- esté en la lista de nombres de arriba, se borra igual. Se conservan solo
-- las tres que sabemos buenas — cualquier cosa distinta es de la época del
-- panel y es justo lo que abría la tabla.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname not in ('profiles_self_select', 'profiles_self_update', 'profiles_admin_all')
  loop
    execute format('drop policy if exists %I on public.profiles', p.policyname);
    raise notice 'policy permisiva borrada de profiles: %', p.policyname;
  end loop;
end $$;

-- Y si por lo que sea faltara alguna de las tres buenas, se vuelve a crear.
-- Sin esto, borrar las permisivas en una base donde las buenas nunca
-- existieron dejaría a la gente sin poder leer su propio perfil.
do $$
begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_self_select') then
    create policy profiles_self_select on public.profiles for select using (id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_self_update') then
    create policy profiles_self_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_admin_all') then
    create policy profiles_admin_all on public.profiles for all using (is_admin()) with check (is_admin());
  end if;
end $$;

alter table public.profiles enable row level security;


-- ============================================================================
-- 3. Restos de un login viejo, abiertos a escritura anónima
-- ============================================================================
-- `crear_vendedor(negocio_id, nombre, pin)` es `security definer`, ejecutable
-- por anon y sin ninguna comprobación de dueño: cualquiera podía darse de
-- alta como "vendedor" con un PIN conocido en el negocio de otro.
-- `verificar_pin_vendedor` tampoco tiene el candado de intentos.
--
-- Son de un sistema anterior (`negocio_vendedores`). El login vivo es
-- `negocio_empleados` / `crear_empleado`, y nada del código toca las viejas.
-- No están en estas migraciones, así que solo pueden estar en producción.
--
-- No se borran, se les quita el permiso: borrar algo que no entiendo del
-- todo, el día del lanzamiento, es peor que dejarlo inalcanzable. Si dentro
-- de un mes siguen sin usarse, se tiran.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('crear_vendedor', 'verificar_pin_vendedor', 'borrar_vendedor', 'actualizar_pin_vendedor')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    raise notice 'funcion vieja de vendedores cerrada: %', f.firma;
  end loop;
end $$;


-- ============================================================================
-- 4. Todo lo demás que no tiene por qué estar al alcance de `anon`
-- ============================================================================
-- Aquí está el detalle que hace que esto NO se pueda hacer de un plumazo:
-- varias funciones `security definer` SÍ tienen que seguir abiertas, y
-- quitarles el permiso rompería la app en silencio.
--
-- SE QUEDAN COMO ESTÁN, y por qué:
--   is_admin, is_negocio_owner, es_negocio_activo
--       Se usan DENTRO de las policies de RLS. Una policy se evalúa con los
--       permisos de quien consulta, así que si `anon` no las puede ejecutar,
--       cualquier consulta a una tabla con esas policies truena. Esto habría
--       tumbado la app entera.
--   negocio_publico_por_slug, citas_publicas_de_negocio
--       Son la página de reservas: la usa gente sin cuenta. Ese es su
--       trabajo.
--
-- PIERDEN `anon` PERO CONSERVAN `authenticated`, porque el navegador las
-- llama con la sesión del dueño ya iniciada:
--   set_pin_dueno, borrar_pin_dueno, pin_dueno_configurado,
--   verificar_pin_dueno, pin_disponible, pin_en_uso, crear_empleado,
--   actualizar_pin_empleado, descontar_stock_atomico,
--   admin_set_pin_dueno, admin_borrar_pin_dueno, admin_pin_dueno_configurado
--
--   (las tres admin_* ya comprueban is_admin() por dentro — verificado; esto
--   es un candado además del que ya tenían. Y pin_en_uso NO está muerta: la
--   llaman crear_empleado y actualizar_pin_empleado, que son `invoker`, así
--   que necesita seguir disponible para `authenticated` o dar de alta un
--   empleado dejaría de funcionar.)
--
-- PIERDEN LAS DOS, porque solo las llama el servidor con service_role:
--   verificar_pin_empleado      -> solo la Edge Function verificar-pin
--   get_citas_por_telefono      -> solo /api/public/citas/lookup
--   find_or_create_barberia_cliente -> solo /api/public/citas
--   handle_new_or_updated_user  -> es un trigger, nadie la llama a mano
--
--   Las dos de citas son las que dejaban rodear el rate limit: el límite de
--   10/min vive dentro de la ruta de Next, pero se podía ir directo a
--   /rest/v1/rpc/ y quedarse sin tope. Por eso esas rutas ahora las llaman
--   con service_role (ver app/api/public/citas/lookup/route.ts).
do $$
declare
  f record;
  solo_authenticated text[] := array[
    'set_pin_dueno', 'borrar_pin_dueno', 'pin_dueno_configurado',
    'verificar_pin_dueno', 'pin_disponible', 'pin_en_uso',
    'crear_empleado', 'actualizar_pin_empleado', 'descontar_stock_atomico',
    'admin_set_pin_dueno', 'admin_borrar_pin_dueno', 'admin_pin_dueno_configurado'
  ];
  ni_uno_ni_otro text[] := array[
    'verificar_pin_empleado', 'get_citas_por_telefono',
    'find_or_create_barberia_cliente', 'handle_new_or_updated_user'
  ];
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(solo_authenticated || ni_uno_ni_otro)
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.proname = any(ni_uno_ni_otro) then
      execute format('revoke all on function %s from authenticated', f.firma);
    else
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
    -- Igual que arriba: service_role se lo devolvemos explícito para que no
    -- dependa del permiso implícito de `public` que acabamos de quitar. Sin
    -- esto, la Edge Function del PIN y las dos rutas públicas de citas se
    -- podrían quedar sin permiso.
    execute format('grant execute on function %s to service_role', f.firma);
    raise notice 'permisos ajustados en %', f.firma;
  end loop;
end $$;


-- ============================================================================
-- 5. Higiene: la vista de citas ya no la usa nadie
-- ============================================================================
-- `barberia_citas_publicas` se salta RLS por no tener `security_invoker`, y
-- el advisor de Supabase la marca en rojo. En la migración pasada le quité
-- el permiso a anon y moví a los dos que la usaban a
-- `citas_publicas_de_negocio`. Ya no queda nadie, así que se tira: una vista
-- que se salta RLS y que nadie usa es solo una trampa esperando a que
-- alguien le vuelva a dar permiso sin acordarse de por qué no lo tenía.
drop view if exists public.barberia_citas_publicas;

notify pgrst, 'reload schema';
