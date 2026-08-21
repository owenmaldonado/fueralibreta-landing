-- Owen reporta en prod: PGRST204 "Could not find the 'empleado_rol_cache'
-- column of 'barberia_citas' in the schema cache" al crear una cita.
--
-- La columna SÍ es correcta y SÍ está definida en el repo —
-- 20260830000000_trazabilidad_empleado.sql la agregó a 6 tablas de una
-- sola vez: barberia_citas, barberia_caja, fonda_pedidos, abarrotes_ventas,
-- fonda_gastos y abarrotes_gastos. De esas 6, solo fonda_gastos/
-- abarrotes_gastos tuvieron su propio re-assert de emergencia
-- (20260831000000_gastos_trazabilidad_reload.sql, para el bug de "gastos
-- se pierden al refrescar" de PR #123) — las otras 4 se quedaron sin ese
-- seguro. Mismo diagnóstico de siempre: este repo no corre
-- `supabase db push` en CI, así que 20260830000000 casi seguro nunca
-- terminó de aplicarse contra el proyecto real (o el schema cache de
-- PostgREST se quedó viejo) para estas 4 tablas en particular.
--
-- NO se quita empleado_rol_cache del insert en lib/data.ts: es la columna
-- que pinta el badge "Dueño" vs "Nombre · Vendedor/Encargado" en
-- EmpleadoBadge — quitarla del payload apagaría esa función para toda
-- cita/venta/pedido/entrada de caja nueva, en vez de arreglar la causa
-- real (el schema del proyecto real desincronizado del repo).
alter table barberia_citas add column if not exists empleado_rol_cache text;
alter table barberia_caja add column if not exists empleado_rol_cache text;
alter table fonda_pedidos add column if not exists empleado_rol_cache text;
alter table abarrotes_ventas add column if not exists empleado_rol_cache text;

notify pgrst, 'reload schema';
