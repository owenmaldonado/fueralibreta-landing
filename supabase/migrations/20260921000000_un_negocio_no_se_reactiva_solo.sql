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
