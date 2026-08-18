-- Fix: "PIN incorrecto" en el PIN maestro de dueño con el PIN correcto.
--
-- Causa confirmada por consola del navegador: el POST a
-- rest/v1/rpc/verificar_pin_dueno devolvía 400, código Postgres 42703
-- (columna inexistente), mensaje "column \"pin_dueno\" does not exist".
--
-- La función verificar_pin_dueno que estaba viva en Supabase no coincidía
-- con la de este repo (las migraciones se pegan a mano en el SQL Editor,
-- no corren por CLI, así que pueden desincronizarse) — hacía referencia a
-- una columna "pin_dueno" que nunca existió; la columna real siempre fue
-- pin_hash. set_pin_dueno sí quedó bien (usa pin_hash correctamente, por
-- eso guardar el PIN funcionaba y mostraba "configurado ✓"), solo
-- verificar_pin_dueno tenía la versión rota.
--
-- Corre esto en el SQL Editor de Supabase con tu cuenta (o service_role).
-- No borra ni modifica ningún dato, solo reemplaza la función.

create or replace function verificar_pin_dueno(p_negocio_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1 from negocio_pin_dueno
    where negocio_id = p_negocio_id and pin_hash = crypt(p_pin, pin_hash)
  );
end;
$$;

-- PostgREST cachea la firma de las funciones; esto fuerza que recoja la
-- versión nueva sin esperar a que expire el caché solo.
notify pgrst, 'reload schema';
