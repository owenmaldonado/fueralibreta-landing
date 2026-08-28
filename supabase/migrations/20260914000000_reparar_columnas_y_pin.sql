-- REPARACIÓN. Tres cosas que se reportaron desde la app en producción:
--
--   1. Guardar en Ajustes > Configuración truena con
--        400  PGRST204  Could not find the 'dias_recordatorio' column
--                       of 'negocios' in the schema cache
--   2. Dar de alta un empleado con PIN truena con 403 en la RPC
--      /rest/v1/rpc/crear_empleado
--   3. (De paso) `negocios.timezone` — de la que depende TODO el cálculo de
--      "qué día es hoy para este negocio", incluidas las gráficas.
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
-- El drop es necesario: cambiar el tipo de retorno de una función existente
-- no se puede hacer con create or replace.
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
begin
  return query
  insert into negocio_empleados (negocio_id, nombre, rol, pin_hash)
  values (
    p_negocio_id,
    -- Title Case server-side (ver 20260908000000): evita el duplicado
    -- "Maria"/"maria" que ya partió en dos a una persona real.
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

-- actualizar_pin_empleado no devuelve nada, así que el revoke de SELECT no
-- la afectaba. Se re-declara igual para dejar las dos juntas y explícitas,
-- y para asegurar el grant.
create or replace function actualizar_pin_empleado(p_empleado_id uuid, p_pin text)
returns void
language sql
as $$
  update negocio_empleados set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_empleado_id;
$$;

grant execute on function actualizar_pin_empleado(uuid, text) to authenticated;

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
