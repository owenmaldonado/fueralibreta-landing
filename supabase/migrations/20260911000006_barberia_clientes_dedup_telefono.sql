-- Bug reportado: mismo cliente reserva con formatos de teléfono distintos
-- (con o sin +52, espacios, guiones) y termina con 2 filas en
-- barberia_clientes porque find_or_create_barberia_cliente comparaba
-- telefono con igualdad de string exacta. Aquí:
--   1. normalizar_telefono_mx(): misma normalización que normalizarTelefono()
--      en lib/mock.ts (quita todo lo que no sea dígito y, si quedan 12
--      dígitos que empiezan con "52", quita el prefijo de país) para que
--      DB y frontend coincidan en qué cuenta como "mismo teléfono".
--   2. find_or_create_barberia_cliente ahora busca por telefono normalizado,
--      no por igualdad exacta.
--   3. Índice único parcial por (negocio_id, telefono normalizado) para que
--      ni un insert directo (fuera de la función) pueda crear un duplicado.

create or replace function normalizar_telefono_mx(p_telefono text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')) = 12
      and regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g') like '52%'
    then substring(regexp_replace(p_telefono, '\D', '', 'g') from 3)
    else regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')
  end;
$$;

drop index if exists barberia_clientes_negocio_telefono_norm_idx;
create unique index barberia_clientes_negocio_telefono_norm_idx
  on barberia_clientes (negocio_id, normalizar_telefono_mx(telefono))
  where normalizar_telefono_mx(telefono) <> '';

create or replace function find_or_create_barberia_cliente(p_negocio_id uuid, p_nombre text, p_telefono text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from negocios n where n.id = p_negocio_id and n.is_active) then
    raise exception 'Negocio no encontrado o inactivo';
  end if;

  -- Esta función es security definer y anon tiene permiso de ejecutarla
  -- directamente (grant execute más abajo), así que valida aunque la API
  -- (app/api/public/citas) ya lo haya hecho — nunca confíes solo en el
  -- frontend/backend de Next para lo que la base de datos puede exponer
  -- por su cuenta.
  if p_nombre is null or length(trim(p_nombre)) < 2 or length(p_nombre) > 50 or p_nombre ~ '[<>]' then
    raise exception 'Nombre inválido';
  end if;
  if p_telefono is null or p_telefono !~ '^[0-9]{7,15}$' then
    raise exception 'Teléfono inválido';
  end if;

  select id into v_id
  from barberia_clientes
  where negocio_id = p_negocio_id and normalizar_telefono_mx(telefono) = normalizar_telefono_mx(p_telefono)
  limit 1;

  if v_id is null then
    insert into barberia_clientes (negocio_id, nombre, telefono, visitas)
    values (p_negocio_id, p_nombre, p_telefono, 0)
    returning id into v_id;
  else
    -- Mismo teléfono (normalizado), nombre distinto al guardado: solo lo
    -- actualiza si el que ya tenía guardado estaba vacío (bug 4: no pisar
    -- el nombre real de un cliente existente por un typo en una reserva nueva).
    update barberia_clientes
    set nombre = p_nombre
    where id = v_id and trim(nombre) = '' and p_nombre is distinct from nombre;
  end if;

  return v_id;
end;
$$;

grant execute on function normalizar_telefono_mx(text) to anon, authenticated;
grant execute on function find_or_create_barberia_cliente(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
