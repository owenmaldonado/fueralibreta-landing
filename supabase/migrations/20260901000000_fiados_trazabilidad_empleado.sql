-- Trazabilidad vendedor/encargado (PR #121) cubrió ventas/citas/caja/pedidos
-- y gastos (20260830000000_trazabilidad_empleado.sql), pero se quedó fuera
-- abarrotes_fiados: dar de alta un fiado desde el FAB ("Fiado") no dejaba
-- ningún rastro de quién lo hizo, a diferencia de una venta o un gasto.
-- Mismo patrón que el resto: se congela AL MOMENTO del alta
-- (camposEmpleado() en lib/empleados.ts), así que un cambio de rol futuro
-- no reescribe el historial.
alter table abarrotes_fiados add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_fiados add column if not exists empleado_nombre_cache text;
alter table abarrotes_fiados add column if not exists empleado_rol_cache text;

notify pgrst, 'reload schema';
