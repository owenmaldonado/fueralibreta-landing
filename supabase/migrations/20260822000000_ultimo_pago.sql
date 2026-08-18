-- Fecha del último pago confirmado por WhatsApp, para la columna "Último
-- pago" del tab Negocios de /admin. No existía nada que lo registrara: se
-- llena solo cuando el admin activa un plan pagado por 30 días (ver
-- activarPlanConDias y updateNegocioTrial(id, 30) en lib/admin-data.ts) —
-- NO con "+7 días"/"+14 días" de trial, esas son extensiones de prueba
-- gratis, no un pago.
alter table negocios add column if not exists ultimo_pago_at timestamptz;

-- Mismo guard que ya protege plan/trial_fin/trial_inicio/precio_custom/
-- es_fundador/notas_admin (ver 20260815000000_esquema.sql): solo se puede
-- tocar con service_role, nunca desde la sesión normal del dueño ni la del
-- admin en el navegador.
create or replace function prevent_owner_admin_field_change()
returns trigger
language plpgsql
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
  ) and auth.role() <> 'service_role' then
    raise exception 'Solo un administrador puede cambiar el plan, trial, precio, estatus de fundador, notas o último pago de un negocio';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
