-- Owen reporta: BUG CRÍTICO, un gasto se agrega en /app fondita (dueño o
-- empleado), aparece en la lista pero al refrescar (F5) desaparece — nunca
-- llegó a Supabase. Mismo síntoma que el de fonda_pedidos.turno_id
-- (20260829000000_fonda_pedidos_turno_id_reload.sql): este repo no tiene
-- ningún pipeline de CI/CD que corra `supabase db push` (ver
-- .github/workflows/, solo auto-merge.yml), así que
-- 20260830000000_trazabilidad_empleado.sql — que agrega empleado_id/
-- empleado_nombre_cache/empleado_rol_cache a fonda_gastos/abarrotes_gastos —
-- casi seguro nunca se aplicó contra el proyecto real, o el PostgREST de
-- ese proyecto se quedó con el schema cache viejo: cualquier INSERT que
-- mande esas columnas revienta con PGRST204 "column not found".
--
-- Este archivo es el mismo re-assert idempotente (add column if not
-- exists, sin tronar si ya existe) + otro NOTIFY, para desatorar el cache
-- si el problema es justo eso.
--
-- OJO: esto NO reemplaza aplicar el migration original si de verdad nunca
-- corrió — hace falta correr `supabase db push` (o pegar el SQL a mano en
-- el SQL Editor de Supabase) contra el proyecto real; nada en este repo lo
-- hace por sí solo.
alter table fonda_gastos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fonda_gastos add column if not exists empleado_nombre_cache text;
alter table fonda_gastos add column if not exists empleado_rol_cache text;

alter table abarrotes_gastos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_gastos add column if not exists empleado_nombre_cache text;
alter table abarrotes_gastos add column if not exists empleado_rol_cache text;

notify pgrst, 'reload schema';
