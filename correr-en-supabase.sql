-- ============================================================================
-- TODO LO QUE FALTA CORRER EN SUPABASE — un solo archivo, en orden.
-- ============================================================================
-- SQL Editor -> pegar esto -> Run.
--
-- Es seguro correrlo aunque ya hayas corrido parte antes: todo está escrito
-- para poder repetirse (add column if not exists, create or replace, y las
-- conversiones se saltan lo que ya está bien).
--
-- Lo que trae:
--   1. Columnas que le faltan a tu base + el 403 al crear empleados
--      + reiniciar el PIN de dueño desde /admin
--      + que un PIN no se pueda repetir dentro del mismo negocio
--   2. Que las columnas de fecha vuelvan a ser DÍA y no instante
--      (lo que llevaba la gráfica al día anterior)
--   3. Lo que necesita el reporte de Cierres del dueño
--   4. Que al cerrar turno el siguiente arranque en CERO en las tres apps
--      (antes solo Fondita se acordaba del último cierre)
--   5. Poder marcar un aviso de faltante como "ya lo revisé", con nota
--   6. El endurecimiento de la auditoría previa al lanzamiento:
--      candado contra probar el PIN a lo bruto, search_path fijo en las
--      funciones con permisos, y las citas públicas ya no se pueden bajar
--      todas de un jalón
--   7. Que un negocio suspendido no pueda reactivarse solo
--   8. CRITICO: cerrar las funciones que estaban abiertas al rol `anon`
--      (cualquiera podia borrar un negocio entero) y las policies viejas
--      que dejaban leer los correos de todos los usuarios
-- ============================================================================


-- ============================================================================
-- ARCHIVO: 20260914000000_reparar_columnas_y_pin.sql
-- ============================================================================
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
-- NOTA SOBRE `set search_path` (por qué dice "public, extensions, pg_temp")
-- ============================================================================
-- Primera versión de este archivo tronaba en Supabase con:
--
--     ERROR: 42883: function crypt(text, text) does not exist
--
-- Causa: estas funciones llevan `set search_path` fijo (buena práctica en una
-- función security definer: sin eso, alguien podría anteponer un esquema con
-- una tabla falsa y hacer que la función lea de ahí). Pero se había puesto
-- `= public` a secas, y en Supabase pgcrypto NO vive en public — vive en el
-- esquema `extensions`. Al fijar el search_path a public, `crypt` y
-- `gen_salt` quedaban fuera de alcance y Postgres decía, con razón, que no
-- existen.
--
-- Las funciones viejas del repo no tenían el problema porque no fijan
-- search_path: heredan el del que llama, que en Supabase ya incluye
-- extensions. O sea, esto lo rompí al endurecerlas.
--
-- `public, extensions, pg_temp` cubre las dos formas de instalar pgcrypto
-- (en public o en extensions) sin perder el candado.
-- ============================================================================

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
set search_path = public, extensions, pg_temp
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
set search_path = public, extensions, pg_temp
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
set search_path = public, extensions, pg_temp
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
set search_path = public, extensions, pg_temp
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
set search_path = public, extensions, pg_temp
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
set search_path = public, extensions, pg_temp
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
set search_path = public, extensions, pg_temp
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


-- ============================================================================
-- ARCHIVO: 20260915000000_fecha_es_dia_no_instante.sql
-- ============================================================================
-- LA CAUSA DE VERDAD del "la gráfica de Fondita se lleva todo al día
-- anterior". Cinco días buscándolo, y estaba en el tipo de una columna.
--
-- CÓMO SE VIO
-- Owen corrió `select fecha, count(*) from fonda_pedidos group by 1` y la
-- columna salió así:
--
--     dia
--     2026-08-28 00:00:00+00
--     2026-08-27 00:00:00+00
--
-- Con hora y con zona. Pero `fonda_pedidos.fecha` está declarada `date` en
-- el esquema de este repo: debería salir "2026-08-28" y nada más. En esa
-- base es `timestamptz`.
--
-- POR QUÉ PASÓ
-- La tabla venía de una versión anterior donde esa columna era timestamptz.
-- `create table if not exists` no toca una tabla que ya existe, y
-- `add column if not exists` no toca una columna que ya existe — ninguno de
-- los dos cambia un tipo. Así que la declaración `date` del esquema nunca
-- se aplicó ahí y la columna se quedó como estaba, en silencio.
--
-- POR QUÉ ROMPÍA LA GRÁFICA
-- La app guarda el día del negocio como texto: "2026-08-28". Postgres lo
-- mete en una columna timestamptz y, con la sesión en UTC, queda como
-- `2026-08-28 00:00:00+00`. Medianoche UTC del 28 es, en México, el 27 a
-- las 6 de la tarde. Cualquier cosa que lea ese texto como un instante
-- —`new Date(...)`, que es lo que hacía la gráfica— contesta 27.
--
-- Y por eso solo se notaba AL REFRESCAR: recién capturado, el pedido vivía
-- en memoria con el string "2026-08-28" y todo cuadraba; al recargar volvía
-- de la base como timestamptz y se corría un día entero.
--
-- QUÉ HACE ESTA MIGRACIÓN
-- Devuelve esas columnas a `date`. El dato NO se pierde ni se mueve:
-- `at time zone 'UTC'` lee el instante en la misma zona en la que se
-- escribió, así que `2026-08-28 00:00:00+00` vuelve a ser exactamente
-- `2026-08-28`.
--
-- El código ya no depende de esto (lib/data.ts recorta a 10 caracteres al
-- leer, así que funciona con columnas de los dos tipos). Esto es para dejar
-- la base como el esquema siempre dijo que estaba, y que la siguiente
-- consulta que alguien escriba a mano en el SQL Editor tampoco mienta.

do $$
declare
  t text;
  tipo_actual text;
begin
  -- SOLO columnas que guardan un DÍA. Quedan fuera a propósito
  -- barberia_caja.fecha y abarrotes_ventas.fecha: esas dos sí son
  -- timestamptz de verdad (guardan el momento exacto del movimiento) y
  -- convertirlas sí perdería información real.
  foreach t in array array[
    'barberia_excepciones',
    'barberia_citas',
    'barberia_cortes',
    'fondita_menu_dia',
    'fonda_pedidos',
    'fonda_gastos',
    'fondita_cortes',
    'fondita_mermas',
    'abarrotes_fiado_movimientos',
    'abarrotes_gastos',
    'abarrotera_cortes',
    'abarrotera_mermas'
  ] loop
    select c.data_type into tipo_actual
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t and c.column_name = 'fecha';

    -- Si la tabla no existe en esta base, o la columna ya es `date`, no hay
    -- nada que hacer — por eso esto se puede correr las veces que sea.
    if tipo_actual is null or tipo_actual = 'date' then
      continue;
    end if;

    raise notice 'Convirtiendo %.fecha de % a date', t, tipo_actual;

    if tipo_actual = 'timestamp with time zone' then
      execute format(
        'alter table public.%I alter column fecha type date using (fecha at time zone ''UTC'')::date',
        t
      );
    else
      -- timestamp sin zona (u otro tipo con fecha adentro): el cast directo
      -- basta, no hay zona que deshacer.
      execute format('alter table public.%I alter column fecha type date using fecha::date', t);
    end if;

    -- El default también viene del tipo viejo (now() en vez de
    -- current_date) — si no se cambia, la primera fila que se inserte sin
    -- fecha vuelve a traer el problema por la puerta de atrás.
    execute format('alter table public.%I alter column fecha set default current_date', t);
  end loop;
end $$;

notify pgrst, 'reload schema';


-- ============================================================================
-- ARCHIVO: 20260917000000_cortes_reporte_dueno.sql
-- ============================================================================
-- Reporte de cierres para el dueño (/app/cortes).
--
-- LO QUE PIDIÓ OWEN
-- "sigue lo mismo sin decirle al vendedor cuánto debería tener, y si hubo
-- alguna diferencia pudo haberle robado o así. Quiero que en el panel del
-- dueño salga lo que hizo su vendedor en el cierre, y ahí vea
-- inconsistencias como esa y le avise: ¡le faltó tanto!"
--
-- La buena noticia es que el dato YA se guarda: los tres wizards de cierre
-- escriben ventas_calculadas, fondo_inicial, gastos, efectivo_real y
-- diferencia (efectivo contado menos lo que debería haber). Lo que faltaba
-- era poder decir QUIÉN cerró con el rol correcto, y una pantalla que lo
-- leyera.
--
-- Falta `empleado_rol_cache` en las tres tablas de cortes: sin rol,
-- EmpleadoBadge hace `const esDueno = !rol || rol === "dueno"` y pinta
-- "Dueño" — el mismo bug que ya apareció en los pedidos de fonda, donde el
-- cierre del vendedor se vería como si lo hubiera hecho el dueño. Que es
-- exactamente lo contrario de lo que este reporte sirve para ver.

alter table barberia_cortes  add column if not exists empleado_rol_cache text;
alter table fondita_cortes   add column if not exists empleado_rol_cache text;
alter table abarrotera_cortes add column if not exists empleado_rol_cache text;

-- Por si a alguna base le falta alguna de las otras (las agrega
-- 20260815000000, pero ya sabemos que una base que viene de una versión
-- vieja puede no tenerlas — es justo lo que pasó con dias_recordatorio).
alter table barberia_cortes   add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table barberia_cortes   add column if not exists empleado_nombre_cache text;
alter table fondita_cortes    add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fondita_cortes    add column if not exists empleado_nombre_cache text;
alter table abarrotera_cortes add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotera_cortes add column if not exists empleado_nombre_cache text;

-- Cerrar un turno desde otro dispositivo debe aparecerle al dueño sin que
-- tenga que recargar — misma razón por la que ya están en la publicación
-- las citas, los pedidos y las ventas. Y es de las cosas que MÁS urge ver
-- en vivo: es el momento en que el vendedor entrega el dinero.
--
-- `add table` sin guarda truena si la tabla ya está publicada, así que cada
-- una va dentro de su propio if — mismo patrón idempotente que el resto de
-- las migraciones de realtime de este repo.
do $$
declare
  t text;
begin
  foreach t in array array['barberia_cortes', 'fondita_cortes', 'abarrotera_cortes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Consultar los cortes por negocio y fecha es lo único que hace la pantalla
-- nueva; sin índice eso es un scan completo de la tabla en cada visita.
create index if not exists barberia_cortes_negocio_fecha_idx   on barberia_cortes (negocio_id, fecha desc);
create index if not exists fondita_cortes_negocio_fecha_idx    on fondita_cortes (negocio_id, fecha desc);
create index if not exists abarrotera_cortes_negocio_fecha_idx on abarrotera_cortes (negocio_id, fecha desc);

notify pgrst, 'reload schema';

-- ==========================================================================
-- ARCHIVO: 20260918000000_turno_cerrado_las_tres_apps.sql
-- ==========================================================================
-- El turno nuevo arranca en CERO, en las tres apps.
--
-- EL BUG
-- Owen: "cierro turno y tal, y vuelvo a iniciar sesión y cierro turno,
-- funciona pero tiene los mismos datos que se supone ya se cerraron, y pues
-- los cuenta para el siguiente cierre".
--
-- Tenía razón y la causa estaba a la vista: de los tres wizards de cierre,
-- solo el de Fondita sabe cuándo fue el último. Barbería y Abarrotera
-- filtran así:
--
--     data.citas.filter((c) => c.fecha === hoy && ...)
--     data.ventas.filter((v) => fechaCalendarioLocal(v.fecha) === hoy)
--
-- O sea: TODO el día, siempre, sin importar cuántos cierres hubo antes. El
-- segundo turno del día vuelve a contar lo del primero, y el vendedor de la
-- tarde queda cuadrando dinero que ya entregó el de la mañana.
--
-- Fondita no lo tenía porque a esa sí se le agregó `turno_fonda_cerrado_en`
-- en su momento. Esta migración generaliza esa idea a las tres.
--
-- POR QUÉ EL CORTE ES DEL NEGOCIO Y NO DE CADA PERSONA
-- El corte se compara contra el dinero que hay en el cajón, y el cajón es
-- uno solo. Si dos personas trabajan el mismo turno y comparten caja, no
-- existe forma de partir el efectivo físico entre las dos, así que "cada
-- quien cuenta lo suyo" nunca cuadraría contra lo que de verdad hay. Por eso
-- la marca es del negocio: el turno nuevo cuenta lo vendido después del
-- último cierre, lo haya hecho quien lo haya hecho. Quién cerró sí queda
-- registrado (empleado_nombre_cache), que es lo que el reporte de /app/cortes
-- necesita para señalar diferencias.

-- Columna genérica para los tres giros.
alter table negocios add column if not exists turno_cerrado_en timestamptz;

-- Fondita ya venía guardando su marca aparte: se copia para no perder el
-- turno en curso de ningún negocio al soltar este cambio. Sin esto, una
-- fonda que cerró hace media hora vería su siguiente corte arrancando desde
-- la medianoche otra vez — justo el bug que estamos cerrando.
--
-- `turno_fonda_cerrado_en` NO se borra: si algo sale mal, el dato viejo
-- sigue ahí para volver atrás.
update negocios
set turno_cerrado_en = turno_fonda_cerrado_en
where turno_cerrado_en is null and turno_fonda_cerrado_en is not null;

notify pgrst, 'reload schema';


-- ==========================================================================
-- ARCHIVO: 20260919000000_cortes_revisados.sql
-- ==========================================================================
-- "Ya lo revisé": apagar el aviso rojo de un cierre sin borrar el dato.
--
-- LO QUE PIDIÓ OWEN
-- "que pueda editar o eliminar el msj de arriba porque sale así en grande y
-- rojo, para que no le salga siempre; solo si lo necesita lo puede borrar,
-- pero que quede ahí guardado, ¿sería bueno que lo pueda editar?"
--
-- El aviso es útil la primera vez y ruido a partir de la segunda: si un
-- faltante ya se aclaró con el vendedor, seguir viéndolo en rojo cada vez que
-- se entra a Cierres solo entrena a ignorarlo — y el día que aparezca uno de
-- verdad, ya no lo va a ver.
--
-- LO QUE **NO** SE PUEDE EDITAR, A PROPÓSITO
-- La diferencia, el efectivo contado y lo esperado se quedan como se
-- registraron. Si el número se pudiera corregir a mano, este reporte dejaría
-- de ser evidencia de nada: cualquiera podría dejarlo en cero y no quedaría
-- rastro. Lo que se agrega es una NOTA al lado — "le di mal el cambio a un
-- cliente" — que explica el faltante sin taparlo.
--
-- Así, dentro de un mes, el dueño no ve solo "faltaron $80" ni "esto ya se
-- revisó": ve las dos cosas, y por qué.

alter table barberia_cortes   add column if not exists revisado_at timestamptz;
alter table barberia_cortes   add column if not exists revisado_nota text;
alter table fondita_cortes    add column if not exists revisado_at timestamptz;
alter table fondita_cortes    add column if not exists revisado_nota text;
alter table abarrotera_cortes add column if not exists revisado_at timestamptz;
alter table abarrotera_cortes add column if not exists revisado_nota text;

notify pgrst, 'reload schema';

-- ==========================================================================
-- ARCHIVO: 20260920000000_endurecer_antes_del_lanzamiento.sql
-- ==========================================================================
-- Endurecimiento previo a abrir la app al público.
--
-- Tres cosas encontradas en la auditoría. Ninguna es un hoyo por el que hoy
-- se esté saliendo información de un cliente a otro, pero las tres son
-- cosas que NO quieres tener el día que la app deje de ser solo tuya.
--
--   1. Ocho funciones `security definer` sin `search_path` fijo, entre
--      ellas is_admin() e is_negocio_owner() — de las que cuelga TODO el RLS.
--   2. El PIN se puede probar de a 10,000 sin que nada te detenga.
--   3. La vista de citas públicas se puede bajar completa, de todos los
--      negocios, sin filtro.


-- ============================================================================
-- 1. search_path fijo en las funciones `security definer`
-- ============================================================================
-- Una función `security definer` corre con los permisos de QUIEN LA CREÓ, no
-- de quien la llama. Si además no lleva `search_path` fijo, hereda el del
-- que llama: alguien que pudiera crear una tabla o función en un esquema que
-- vaya antes en ese search_path podría hacer que la función mire SU tabla en
-- vez de la de verdad — y ejecutarla con permisos elevados.
--
-- ¿Se puede hacer eso hoy? No: ni `anon` ni `authenticated` tienen CREATE en
-- el esquema public (lo comprobé). Esto es un cinturón además del tirante.
-- Pero el día que alguna extensión o migración otorgue CREATE, se caería de
-- un golpe TODO el aislamiento entre negocios, porque is_negocio_owner() es
-- la que decide quién ve qué en las 30 y tantas tablas.
--
-- Y hay una segunda razón, más terrenal: verificar_pin_dueno y
-- verificar_pin_empleado llaman a crypt() (pgcrypto), que en Supabase vive
-- en el esquema `extensions`. Hoy funcionan solo porque el search_path del
-- que llama incluye `extensions`. Es exactamente el error que ya nos tocó
-- ver de este mismo tema:
--     ERROR: 42883: function crypt(text, text) does not exist
-- Por eso el search_path que se fija es `public, extensions, pg_temp` y no
-- solo `public`: si fuera solo public, el PIN dejaría de funcionar.
--
-- pg_temp va al final SIEMPRE, y a propósito: si fuera al principio,
-- cualquiera podría crear una tabla temporal que suplante a una real.

-- SE HACE EN UN CICLO, NO NOMBRANDO CADA FUNCIÓN, Y ESA DECISIÓN COSTÓ
-- La primera versión de este archivo listaba las doce funciones con su
-- firma exacta:
--     alter function public.negocio_publico_por_slug(text) set search_path = ...
-- y al probarlo contra una base que NO tenía esa función tronó con
--     ERROR: function public.negocio_publico_por_slug(text) does not exist
-- y, por ser todo una sola transacción, se cayó la migración COMPLETA: ni
-- el candado del PIN ni lo de las citas se aplicaban. Justo el mismo tipo
-- de falla que esta auditoría encontró en 20260911000010.
--
-- No sé con certeza el estado exacto de cada base, así que el ciclo agarra
-- las que HAY: recorre las funciones `security definer` de public que no
-- tengan search_path fijo y se los pone. Si alguna falta, no pasa nada; si
-- mañana alguien agrega una nueva y se le olvida el search_path, volver a
-- correr esto la cubre también.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        p.proconfig is null
        -- Las que ya traían `search_path = public` a secas: les falta
        -- `extensions`, que es donde vive pgcrypto. Ninguna usa crypt hoy,
        -- pero que la regla sea una sola evita el próximo 42883.
        or not exists (
          select 1 from unnest(p.proconfig) as c(v)
          where c.v like 'search_path=%' and c.v like '%extensions%'
        )
      )
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.firma);
    raise notice 'search_path fijado en %', f.firma;
  end loop;
end $$;


-- ============================================================================
-- 2. Candado contra probar el PIN a lo bruto
-- ============================================================================
-- EL PROBLEMA
-- El PIN son 4 dígitos: 10,000 combinaciones. Hay un candado en la pantalla
-- que corta después de varios intentos, pero vive en el NAVEGADOR, y
-- verificar_pin_dueno / verificar_pin_empleado están abiertas a `anon` y
-- `authenticated`. O sea: quien se salte la pantalla y le hable directo a la
-- base (unas líneas de código, nada sofisticado) puede probar las 10,000 sin
-- que nada lo detenga.
--
-- QUÉ TAN GRAVE ES, DE VERDAD
-- Menos de lo que suena, y conviene tenerlo claro: adivinar el PIN NO da
-- acceso a los datos de un negocio ajeno. Para leer ventas o cortes, RLS
-- exige que auth.uid() sea el dueño o un empleado activo — el PIN no cambia
-- eso. Donde SÍ importa es adentro de un mismo negocio, en el celular o
-- tablet que se comparte: un vendedor puede sacarle el PIN al dueño y
-- abrirse el panel de dueño. Ese es justo el caso que hay que cuidar.
--
-- EL CANDADO
-- Va DENTRO de la función, que es el único lugar que no se puede rodear: no
-- importa si la llamada viene de la app, de la Edge Function o de un curl.
-- Cada intento queda registrado (auditoria_pin, la misma tabla que ya
-- usabas para ver quién falló) y si hay demasiados fallos seguidos en poco
-- rato, se deja de responder por un rato.
--
-- Cada "carril" cuenta aparte: los fallos contra el PIN del dueño no
-- bloquean a un vendedor, ni al revés. Si fuera un solo contador por
-- negocio, un vendedor con dedos torpes dejaría a todo el local sin poder
-- entrar en plena hora pico.
--
-- La ventana se cuenta desde el último acierto: si le fallas dos veces y a
-- la tercera entras, el contador vuelve a cero y no te quedas a un intento
-- del bloqueo.
--
-- El costo aceptado: alguien que sepa el id de un negocio puede dejar
-- bloqueado ese carril 15 minutos a propósito. Se cura solo, y es mejor que
-- la alternativa.

create index if not exists auditoria_pin_carril_idx
  on auditoria_pin (negocio_id, empleado_id_intentado, created_at desc);

-- Cuántos fallos seguidos lleva este carril desde el último acierto.
-- p_empleado_id null = el carril del PIN de dueño.
create or replace function public.fallos_recientes_de_pin(
  p_negocio_id uuid,
  p_empleado_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select count(*)::int
  from auditoria_pin a
  where a.negocio_id = p_negocio_id
    and a.empleado_id_intentado is not distinct from p_empleado_id
    and a.exito = false
    and a.created_at > now() - interval '15 minutes'
    and a.created_at > coalesce(
      (select max(b.created_at) from auditoria_pin b
        where b.negocio_id = p_negocio_id
          and b.empleado_id_intentado is not distinct from p_empleado_id
          and b.exito),
      '-infinity'::timestamptz
    );
$$;

revoke all on function public.fallos_recientes_de_pin(uuid, uuid) from public, anon, authenticated;

-- 10 fallos seguidos en 15 minutos y ese carril se cierra.
--
-- Para una persona son de sobra (nadie teclea mal su PIN 10 veces seguidas
-- en cuarto de hora). Para quien lo esté probando a lo bruto son 40 por
-- hora: las 10,000 combinaciones le tomarían más de diez días de estar
-- picándole sin parar, y cada intento queda escrito en auditoria_pin con su
-- hora. En la práctica, muerto.
--
-- Nota: por el carril de empleado, la Edge Function ya escribe su propio
-- renglón por intento, así que ahí cada intento real cuenta doble y el corte
-- efectivo son ~5. También son de sobra.
create or replace function public.verificar_pin_dueno(p_negocio_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_ok boolean;
begin
  if fallos_recientes_de_pin(p_negocio_id, null) >= 10 then
    insert into auditoria_pin (negocio_id, empleado_id_intentado, exito, motivo)
    values (p_negocio_id, null, false, 'bloqueado_por_intentos');
    raise exception 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.'
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from negocio_pin_dueno
    where negocio_id = p_negocio_id and pin_hash = crypt(p_pin, pin_hash)
  ) into v_ok;

  insert into auditoria_pin (negocio_id, empleado_id_intentado, exito, motivo)
  values (p_negocio_id, null, v_ok, case when v_ok then 'pin_correcto' else 'pin_incorrecto' end);

  return v_ok;
end;
$$;

create or replace function public.verificar_pin_empleado(
  p_negocio_id uuid,
  p_empleado_id uuid,
  p_pin text
)
returns table(id uuid, nombre text, rol text, user_id uuid)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_encontrado boolean := false;
begin
  if fallos_recientes_de_pin(p_negocio_id, p_empleado_id) >= 10 then
    insert into auditoria_pin (negocio_id, empleado_id_intentado, exito, motivo)
    values (p_negocio_id, p_empleado_id, false, 'bloqueado_por_intentos');
    raise exception 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.'
      using errcode = 'check_violation';
  end if;

  -- Se resuelve a una tabla temporal primero para poder saber si hubo
  -- resultado ANTES de devolverlo: con `return query` a secas no hay forma
  -- de contar las filas sin perderlas.
  return query
    select e.id, e.nombre, e.rol, e.user_id
    from negocio_empleados e
    where e.id = p_empleado_id
      and e.negocio_id = p_negocio_id
      and e.activo = true
      and e.pin_hash = crypt(p_pin, e.pin_hash);

  v_encontrado := found;

  insert into auditoria_pin (negocio_id, empleado_id_intentado, exito, motivo)
  values (p_negocio_id, p_empleado_id, v_encontrado,
          case when v_encontrado then 'pin_correcto' else 'pin_incorrecto' end);
end;
$$;


-- ============================================================================
-- 3. Las citas públicas ya no se pueden bajar todas de un jalón
-- ============================================================================
-- EL PROBLEMA
-- `barberia_citas_publicas` es una vista SIN `security_invoker`, o sea que
-- corre con los permisos de quien la creó y se salta el RLS de
-- barberia_citas. Y `anon` tenía SELECT sobre ella. Como la vista no filtra
-- por negocio, cualquiera con la llave pública (que va en el navegador, es
-- pública por diseño) podía pedirla SIN filtro y bajarse las citas de TODOS
-- los negocios: negocio_id, fecha, hora, estado y servicio.
--
-- No trae nombres, teléfonos ni precios — eso nunca estuvo ahí. Pero sí
-- deja ver cuántas citas tiene cada negocio y a qué horas, incluido el
-- historial. Para un negocio suelto eso ya es público (está en su propia
-- página de reservas); lo que no debería poderse es sacarlo de todos juntos.
--
-- POR QUÉ NO SE ARREGLA CON security_invoker
-- Poniéndole security_invoker la vista respetaría el RLS de barberia_citas,
-- que no tiene policy de SELECT para anon — y la página de reservas dejaría
-- de ver los huecos ocupados. Se rompería justo lo que la vista existe para
-- resolver. El arreglo es exigir SIEMPRE el negocio, no quitar el permiso.
--
-- La vista se queda (por si algo más la usa y para no romper nada), pero ya
-- no se le puede pedir a la base directo desde el navegador.

create or replace function public.citas_publicas_de_negocio(
  p_negocio_id uuid,
  p_fecha date default null
)
returns table(negocio_id uuid, fecha date, hora time, estado text, servicio_id uuid)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select c.negocio_id, c.fecha, c.hora, c.estado, c.servicio_id
  from barberia_citas c
  where c.negocio_id = p_negocio_id
    and c.estado <> 'cancelada'
    and (p_fecha is null or c.fecha = p_fecha)
    -- Mismo candado que el resto de lo público: de un negocio dado de baja
    -- o suspendido no se contesta nada.
    and es_negocio_activo(c.negocio_id);
$$;

grant execute on function public.citas_publicas_de_negocio(uuid, date) to anon, authenticated;

-- Con `if exists` por lo mismo que el ciclo de arriba: si en alguna base la
-- vista no está, un revoke a secas tumbaría toda la migración.
do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'barberia_citas_publicas'
  ) then
    revoke select on public.barberia_citas_publicas from anon, authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';


-- ==========================================================================
-- ARCHIVO: 20260921000000_un_negocio_no_se_reactiva_solo.sql
-- ==========================================================================
-- Un negocio suspendido ya no puede reactivarse solo.
--
-- EL HOYO
-- `negocios_admin_fields_guard` cuida plan, trial, precio, fundador, notas y
-- último pago: un cliente no se puede subir a Pro+ él mismo. Bien.
--
-- Pero `is_active` NO estaba en esa lista, y la policy de UPDATE de negocios
-- deja al dueño escribir su propia fila. Comprobado contra la base:
--
--   A) update negocios set plan='pro_plus'  -> ERROR, lo detiene el guardián
--   B) update negocios set is_active=true   -> UPDATE 1, pasó
--
-- O sea: suspendes a alguien por falta de pago desde /admin, y esa persona
-- se reactiva sola con una línea. Los nombres de la tabla y la columna van
-- en el JavaScript que baja el navegador, no hay que adivinar nada.
--
-- `demo` entra por lo mismo: marca a un negocio como de mentiras y de ahí
-- cuelgan avisos y comportamientos que no deberían poder prenderse solos.
--
-- POR QUÉ SE AGREGA `not is_admin()` Y NO SOLO SE ALARGA LA LISTA
-- La condición de antes era "a menos que seas service_role". Pero el botón
-- de suspender de /admin (toggleNegocioActive, lib/admin-data.ts) NO pasa
-- por una ruta de servidor: escribe desde el navegador con la sesión del
-- admin, apoyado en la policy negocios_admin_all. Si solo agregara
-- `is_active` a la lista, el guardián te bloquearía a TI y te quedarías sin
-- poder suspender a nadie.
--
-- Con `not is_admin()` quedan los tres casos como deben:
--   service_role (rutas de /api/admin)  -> pasa
--   admin (tú, desde /admin)            -> pasa
--   dueño de un negocio                 -> lo detiene
--
-- Esto no le abre nada nuevo a un admin: por las rutas con service_role ya
-- podía cambiar cualquiera de estos campos.

create or replace function public.prevent_owner_admin_field_change()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if (
    new.plan is distinct from old.plan
    or new.trial_fin is distinct from old.trial_fin
    or new.trial_inicio is distinct from old.trial_inicio
    or new.precio_custom is distinct from old.precio_custom
    or new.es_fundador is distinct from old.es_fundador
    or new.notas_admin is distinct from old.notas_admin
    or new.ultimo_pago_at is distinct from old.ultimo_pago_at
    -- Nuevos: sin esto, una cuenta suspendida se reactivaba sola.
    or new.is_active is distinct from old.is_active
    or new.demo is distinct from old.demo
  ) and auth.role() <> 'service_role' and not is_admin() then
    raise exception 'Solo un administrador puede cambiar el plan, trial, precio, estatus de fundador, notas, último pago, la activación o el modo demo de un negocio';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

-- ==========================================================================
-- ARCHIVO: 20260922000000_cerrar_puertas_abiertas_a_anon.sql
-- ==========================================================================
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
