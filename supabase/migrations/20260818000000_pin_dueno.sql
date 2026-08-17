-- PIN maestro de dueño: "No se pudo guardar el PIN" en Configuración >
-- Empleados. El código del cliente (lib/empleados.ts: setPinDueno /
-- verificarPinDueno / pinDuenoConfigurado / borrarPinDueno) ya asume que
-- existen esta tabla y estas funciones RPC — ya estaban en
-- 20260815000000_esquema.sql, pero ese archivo es gigante y se pega a mano
-- en el SQL Editor, así que es fácil que este bloque en particular nunca se
-- haya llegado a correr. Este archivo aparte es justo ese bloque, para
-- poder pegarlo solo. Es seguro volver a correrlo (create table/function
-- son idempotentes) incluso si SÍ ya se había aplicado.
--
-- Pega este archivo en Supabase → SQL Editor → New query → Run. Requiere
-- que ya exista is_negocio_owner() (definida en 20260815000000_esquema.sql)
-- — si esa función no existe, casi todo lo demás en la app también estaría
-- roto, no solo el PIN maestro.

create extension if not exists "pgcrypto";

-- Tabla APARTE de negocios a propósito, no una columna ahí: negocios tiene
-- una policy de SELECT pública (is_active = true — la necesita /b/[slug]
-- para visitantes anónimos), así que un pin_hash puesto ahí se filtraría a
-- cualquiera que pida ese negocio por slug, aunque esté hasheado. Esta
-- tabla nunca tiene policy de select/update/insert propia — RLS deniega
-- todo por default, así que el hash SOLO se toca dentro de las funciones
-- security definer de abajo, nunca directo desde el cliente.
create table if not exists negocio_pin_dueno (
  negocio_id uuid primary key references negocios(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table negocio_pin_dueno enable row level security;

-- El front (banner en Ajustes > Empleados y el selector de turno) solo
-- necesita saber SI hay un PIN configurado, nunca el hash.
create or replace function pin_dueno_configurado(p_negocio_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from negocio_pin_dueno where negocio_id = p_negocio_id);
$$;

-- Alta/regenerar el PIN maestro (4 dígitos, validado en el front antes de
-- llamar esto — ver PinDuenoBanner en app/app/empleados/page.tsx). Hash con
-- bcrypt (pgcrypto crypt() + gen_salt('bf')), nunca en texto plano.
create or replace function set_pin_dueno(p_negocio_id uuid, p_pin text)
returns void
language plpgsql
security definer
as $$
begin
  if not is_negocio_owner(p_negocio_id) then
    raise exception 'No autorizado.';
  end if;
  insert into negocio_pin_dueno (negocio_id, pin_hash, updated_at)
  values (p_negocio_id, crypt(p_pin, gen_salt('bf')), now())
  on conflict (negocio_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

-- Verifica el PIN maestro contra el hash — nunca regresa ni expone el hash,
-- solo un booleano.
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

-- "Olvidé mi PIN": borra el PIN maestro tras reconfirmar identidad por
-- correo (ver solicitarResetPinDueno en lib/empleados.ts).
create or replace function borrar_pin_dueno(p_negocio_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not is_negocio_owner(p_negocio_id) then
    raise exception 'No autorizado.';
  end if;
  delete from negocio_pin_dueno where negocio_id = p_negocio_id;
end;
$$;
