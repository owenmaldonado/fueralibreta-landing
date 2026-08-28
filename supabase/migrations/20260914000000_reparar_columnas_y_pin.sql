-- REPARACIÓN. Cuatro cosas que se reportaron desde la app en producción:
--
--   1. Guardar en Ajustes > Configuración truena con
--        400  PGRST204  Could not find the 'dias_recordatorio' column
--                       of 'negocios' in the schema cache
--   2. Dar de alta un empleado con PIN truena con 403 en la RPC
--      /rest/v1/rpc/crear_empleado
--   3. (De paso) `negocios.timezone` — de la que depende TODO el cálculo de
--      "qué día es hoy para este negocio", incluidas las gráficas.
--   4. Un PIN de dueño igual al de un empleado le daba a esa persona una
--      llave al panel de dueño (ver el punto 5, que es el detalle).
--
-- Es idempotente: se puede correr las veces que haga falta sin romper nada.

-- ============================================================================
-- 1. Columnas de `negocios` que la app escribe
-- ============================================================================
-- El PGRST204 de arriba dice literalmente "no encuentro esa columna". Puede
-- ser por dos motivos y esta migración cubre los dos:
--
--   a) La columna de verdad no existe porque la migración que la agregaba
--      (20260817000000 para dias_recordatorio, 20260906000000 para
--      timezone, 20260905000000 para turno_fonda_cerrado_en) nunca se corrió
--      en esta base. `add column if not exists` la crea.
--   b) La columna sí existe pero PostgREST tiene el esquema viejo en caché.
--      El `notify pgrst` del final lo resuelve.
--
-- Se re-declaran TODAS las columnas que businessToRow/syncTenantDiff
-- (lib/data.ts) mandan, no solo la que reportó el error: PostgREST se queja
-- de UNA por petición, así que arreglar solo esa nada más destapa la
-- siguiente.
alter table negocios add column if not exists dias_recordatorio integer not null default 28;
alter table negocios add column if not exists timezone text;
alter table negocios add column if not exists turno_fonda_cerrado_en timestamptz;
alter table negocios add column if not exists telefono_contacto text;
alter table negocios add column if not exists accepted_terms_at timestamptz;
alter table negocios add column if not exists ultimo_pago_at timestamptz;

-- ============================================================================
-- 2. El 403 al crear un empleado
-- ============================================================================
-- Causa exacta: la migración 20260913000000 le quitó a `authenticated` el
-- permiso de leer la columna `pin_hash` de negocio_empleados (bien: el hash
-- de un PIN de 4 dígitos se rompe al instante si se filtra). Pero
-- crear_empleado estaba declarada como
--
--     returns negocio_empleados
--
-- o sea, devuelve la FILA COMPLETA — pin_hash incluido. Para serializar esa
-- respuesta PostgREST necesita permiso de lectura sobre todas las columnas
-- de la fila, y sobre pin_hash ya no lo tiene: 403.
--
-- No es que faltara un permiso; es que la función no debería estar
-- devolviendo el hash en primer lugar. Ahora devuelve solo las columnas
-- públicas del empleado — que además es todo lo que la pantalla de Empleados
-- usa de la respuesta.
--
-- Sigue SIN ser security definer, a propósito: corre con los privilegios de
-- quien la llama, así que la policy `negocio_empleados_owner`
-- (is_negocio_owner) sigue siendo la que decide, y un dueño no puede crear
-- empleados en un negocio ajeno.
--
-- La definición nueva de crear_empleado (y la de actualizar_pin_empleado)
-- están más abajo, en el punto 5 — ahí llevan además el chequeo de PIN
-- repetido, así que tenerlas en un solo lugar evita dejar dos versiones
-- distintas de la misma función en este archivo.

-- ============================================================================
-- 3. Reiniciar el PIN de dueño desde el panel de admin
-- ============================================================================
-- "Olvidé mi PIN" mandaba un magic link al correo del dueño. En la práctica
-- ese correo lleva a la pantalla de login de Supabase y el dueño se queda
-- atorado. El PIN está hasheado con bcrypt, así que NO se puede mostrar —
-- ni en el panel de admin ni en ningún lado; lo único posible es ponerle
-- uno nuevo.
--
-- Esta función deja que el super admin le fije un PIN nuevo al negocio que
-- se lo pida por WhatsApp. Es security definer porque negocio_pin_dueno no
-- tiene ninguna policy (RLS deniega todo por default, a propósito: el hash
-- solo se toca desde funciones como esta), y adentro comprueba is_admin()
-- — sin eso, cualquier usuario logueado podría reescribir el PIN de
-- cualquier negocio.
-- Por si esta base tampoco tiene la tabla (misma historia que las columnas
-- del punto 1). Idéntica a la de 20260818000000_pin_dueno.sql.
create table if not exists negocio_pin_dueno (
  negocio_id uuid primary key references negocios(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);
alter table negocio_pin_dueno enable row level security;

create or replace function admin_set_pin_dueno(p_negocio_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo el super admin puede reiniciar el PIN de dueño de un negocio';
  end if;
  if p_pin !~ '^\d{4}$' then
    raise exception 'El PIN debe ser de 4 dígitos';
  end if;

  insert into negocio_pin_dueno (negocio_id, pin_hash, updated_at)
  values (p_negocio_id, crypt(p_pin, gen_salt('bf')), now())
  on conflict (negocio_id) do update
    set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

grant execute on function admin_set_pin_dueno(uuid, text) to authenticated;

-- Quitarlo del todo (el negocio vuelve a "sin PIN de dueño" y lo configura
-- de nuevo desde Ajustes > Empleados, sin que nadie tenga que dictarle uno).
create or replace function admin_borrar_pin_dueno(p_negocio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo el super admin puede borrar el PIN de dueño de un negocio';
  end if;
  delete from negocio_pin_dueno where negocio_id = p_negocio_id;
end;
$$;

grant execute on function admin_borrar_pin_dueno(uuid) to authenticated;

-- Para pintar "PIN de dueño: configurado / sin configurar" en el panel de
-- admin. Devuelve un booleano, nunca el hash.
create or replace function admin_pin_dueno_configurado(p_negocio_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo el super admin puede consultar esto';
  end if;
  return exists (select 1 from negocio_pin_dueno where negocio_id = p_negocio_id);
end;
$$;

grant execute on function admin_pin_dueno_configurado(uuid) to authenticated;

-- ============================================================================
-- 4. Refrescar el caché de esquema de PostgREST
-- ============================================================================
-- Sin esto, PostgREST sigue sirviendo el esquema que tenía en memoria y las
-- columnas/funciones de arriba "no existen" aunque ya estén en la base —
-- que es la mitad b) del PGRST204 del principio.
notify pgrst, 'reload schema';

-- ============================================================================
-- 5. Que un PIN no se pueda repetir dentro del mismo negocio
-- ============================================================================
-- Pregunta de Owen: "¿y si el PIN de dueño es el mismo que el de algún
-- trabajador?".
--
-- QUÉ NO PASA (para que quede claro): nadie se confunde de persona. El
-- kiosko primero te pide elegir tu nombre y recién después el PIN, y
-- verificar_pin_empleado recibe el empleado_id — compara ese PIN contra ESA
-- persona nada más. Dos empleados con el mismo PIN siguen entrando cada uno
-- como quien es.
--
-- QUÉ SÍ PASA, Y ES EL PROBLEMA DE VERDAD: el PIN de dueño se pide en una
-- pantalla aparte ("volver a modo Dueño" / "Acceso a Empleados") donde NO se
-- pregunta quién eres — se asume que si sabes ese PIN, eres el dueño. Así
-- que si María tiene 1098 de PIN y el dueño también pone 1098, María puede
-- tocar "volver a modo Dueño" y entrar al panel completo: gráficas, caja,
-- gastos, todo. No es que se confunda el sistema; es que le queda una llave
-- que no le tocaba.
--
-- Al azar la probabilidad es 1 en 10 mil, pero deja de ser al azar en cuanto
-- alguien escribe el PIN a mano en vez de usar el botón de sugerir — y ahí
-- repetir un número "fácil de acordarse" es justo lo que uno hace.
--
-- Se cierra del lado de Postgres, no del formulario: aunque alguien llame la
-- RPC por su cuenta, el choque se rechaza igual.

-- Devuelve con QUIÉN choca el PIN ('empleado' | 'dueno') o null si está
-- libre. security definer porque tiene que leer pin_hash, que desde la
-- migración 20260913000000 ya no es legible para `authenticated`.
create or replace function pin_en_uso(p_negocio_id uuid, p_pin text, p_excluir_empleado uuid default null)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when exists (
      select 1 from negocio_empleados e
      where e.negocio_id = p_negocio_id
        and e.activo
        -- Al cambiarle el PIN a alguien, su PIN actual no cuenta como choque
        -- consigo mismo.
        and (p_excluir_empleado is null or e.id <> p_excluir_empleado)
        and e.pin_hash = crypt(p_pin, e.pin_hash)
    ) then 'empleado'
    when exists (
      select 1 from negocio_pin_dueno d
      where d.negocio_id = p_negocio_id and d.pin_hash = crypt(p_pin, d.pin_hash)
    ) then 'dueno'
  end;
$$;

grant execute on function pin_en_uso(uuid, text, uuid) to authenticated;

-- El generador de PINs (botón "sugerir") ya evitaba chocar con otro
-- empleado, pero no miraba el PIN de dueño — podía proponerle a un vendedor
-- justo el PIN que abre el modo dueño. Ahora mira los dos.
create or replace function pin_disponible(p_negocio_id uuid, p_pin text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select pin_en_uso(p_negocio_id, p_pin) is null;
$$;

-- Alta de empleado: rechaza el PIN repetido. El mensaje sale tal cual en el
-- formulario de Ajustes > Empleados (muestra err.message), por eso está
-- escrito para que lo lea el dueño, no un programador.
drop function if exists crear_empleado(uuid, text, text, text);

create function crear_empleado(p_negocio_id uuid, p_nombre text, p_rol text, p_pin text)
returns table (
  id uuid,
  negocio_id uuid,
  nombre text,
  rol text,
  user_id uuid,
  activo boolean,
  created_at timestamptz
)
language plpgsql
as $$
declare
  choca text;
begin
  choca := pin_en_uso(p_negocio_id, p_pin);
  if choca = 'empleado' then
    raise exception 'Ese PIN ya lo usa otro empleado. Escoge otro o dale al botón de sugerir.';
  elsif choca = 'dueno' then
    raise exception 'Ese PIN es el tuyo de dueño. Si se lo das a un empleado podría entrar al panel de dueño — escoge otro.';
  end if;

  return query
  insert into negocio_empleados (negocio_id, nombre, rol, pin_hash)
  values (
    p_negocio_id,
    initcap(trim(regexp_replace(p_nombre, '\s+', ' ', 'g'))),
    p_rol,
    crypt(p_pin, gen_salt('bf'))
  )
  returning
    negocio_empleados.id,
    negocio_empleados.negocio_id,
    negocio_empleados.nombre,
    negocio_empleados.rol,
    negocio_empleados.user_id,
    negocio_empleados.activo,
    negocio_empleados.created_at;
end;
$$;

grant execute on function crear_empleado(uuid, text, text, text) to authenticated;

-- Cambiar/regenerar el PIN de un empleado: mismo chequeo, excluyéndolo a él.
create or replace function actualizar_pin_empleado(p_empleado_id uuid, p_pin text)
returns void
language plpgsql
as $$
declare
  v_negocio_id uuid;
  choca text;
begin
  select e.negocio_id into v_negocio_id from negocio_empleados e where e.id = p_empleado_id;
  if v_negocio_id is null then
    raise exception 'No se encontró ese empleado.';
  end if;

  choca := pin_en_uso(v_negocio_id, p_pin, p_empleado_id);
  if choca = 'empleado' then
    raise exception 'Ese PIN ya lo usa otro empleado. Escoge otro o dale al botón de sugerir.';
  elsif choca = 'dueno' then
    raise exception 'Ese PIN es el tuyo de dueño. Si se lo das a un empleado podría entrar al panel de dueño — escoge otro.';
  end if;

  update negocio_empleados set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_empleado_id;
end;
$$;

grant execute on function actualizar_pin_empleado(uuid, text) to authenticated;

-- El dueño poniéndose su propio PIN: se rechaza si es el de un empleado.
-- Si choca con 'dueno' es su PIN de ahorita y se está reconfirmando el
-- mismo — eso sí se deja pasar.
create or replace function set_pin_dueno(p_negocio_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_negocio_owner(p_negocio_id) then
    raise exception 'No autorizado.';
  end if;
  if p_pin !~ '^\d{4}$' then
    raise exception 'El PIN debe ser de 4 dígitos.';
  end if;
  if pin_en_uso(p_negocio_id, p_pin) = 'empleado' then
    raise exception 'Ese PIN ya es el de un empleado tuyo. Si lo usas, esa persona podría entrar a tu panel de dueño — escoge otro.';
  end if;

  insert into negocio_pin_dueno (negocio_id, pin_hash, updated_at)
  values (p_negocio_id, crypt(p_pin, gen_salt('bf')), now())
  on conflict (negocio_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

grant execute on function set_pin_dueno(uuid, text) to authenticated;

-- Mismo chequeo cuando el PIN lo pone soporte desde /admin: si el número
-- que iba a dictar resulta ser el de un empleado, no se guarda y el panel
-- avisa para escoger otro.
create or replace function admin_set_pin_dueno(p_negocio_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo el super admin puede reiniciar el PIN de dueño de un negocio';
  end if;
  if p_pin !~ '^\d{4}$' then
    raise exception 'El PIN debe ser de 4 dígitos';
  end if;
  if pin_en_uso(p_negocio_id, p_pin) = 'empleado' then
    raise exception 'Ese PIN ya es el de un empleado de este negocio — escoge otro, si no esa persona podría entrar al panel de dueño.';
  end if;

  insert into negocio_pin_dueno (negocio_id, pin_hash, updated_at)
  values (p_negocio_id, crypt(p_pin, gen_salt('bf')), now())
  on conflict (negocio_id) do update
    set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

grant execute on function admin_set_pin_dueno(uuid, text) to authenticated;

notify pgrst, 'reload schema';
