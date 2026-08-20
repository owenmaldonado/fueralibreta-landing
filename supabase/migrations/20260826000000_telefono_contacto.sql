-- WhatsApp de contacto pedido en /onboarding (obligatorio, 10 dígitos MX) —
-- separado del `telefono` viejo de negocios (opcional, "teléfono de
-- recuperación", casi nunca se llena) para que el panel admin siempre
-- tenga un número real con el que contactar al dueño por WhatsApp.
alter table negocios add column if not exists telefono_contacto text;

-- Copia del mismo teléfono en profiles, para tenerlo también a nivel de
-- cuenta (no solo del negocio) — ej. si el dueño abre un segundo negocio
-- más adelante. Distinta de la columna `phone` ya existente (esa quedó sin
-- uso desde que se abandonó el login por SMS, ver comentario de `telefono`
-- en negocios más arriba en este archivo).
alter table profiles add column if not exists telefono text;

-- Un usuario normal puede actualizar SU PROPIA fila de profiles (antes solo
-- podía leerla, profiles_self_select) — hace falta para guardar `telefono`
-- desde /onboarding sin pasar por una ruta con service_role. El trigger de
-- abajo es el guard real: sin él, esta misma policy dejaría a cualquiera
-- regalarse role='admin' o plan='pro' con una llamada directa a Supabase.
drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function prevent_profile_self_privileged_change()
returns trigger
language plpgsql
as $$
begin
  if (
    new.role is distinct from old.role
    or new.plan is distinct from old.plan
    or new.is_banned is distinct from old.is_banned
    or new.email is distinct from old.email
  ) and auth.role() <> 'service_role' then
    raise exception 'Solo un administrador puede cambiar el rol, plan, baneo o email de un perfil';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_privileged_fields_guard on profiles;
create trigger profiles_privileged_fields_guard
  before update on profiles
  for each row execute function prevent_profile_self_privileged_change();
