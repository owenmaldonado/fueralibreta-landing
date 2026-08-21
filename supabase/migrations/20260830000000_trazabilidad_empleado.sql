-- Trazabilidad vendedor/encargado (PR #121): el dueño necesita ver QUIÉN
-- hizo cada venta/cita/gasto, no solo que existe. empleado_id/
-- empleado_nombre_cache ya existían (multiusuario PIN, PR previo) en
-- barberia_citas, barberia_caja, fonda_pedidos y abarrotes_ventas — les
-- falta el ROL (dueño/encargado/vendedor) para poder pintar el badge
-- amarillo vs gris sin tener que hacer join a negocio_empleados (que
-- además puede no tener ya esa fila si el empleado se dio de baja).
--
-- Mismo criterio que empleado_nombre_cache: se congela AL MOMENTO del
-- movimiento (camposEmpleado() en lib/empleados.ts), así que un cambio de
-- rol futuro no reescribe el historial.
alter table barberia_citas add column if not exists empleado_rol_cache text;
alter table barberia_caja add column if not exists empleado_rol_cache text;
alter table fonda_pedidos add column if not exists empleado_rol_cache text;
alter table abarrotes_ventas add column if not exists empleado_rol_cache text;

-- fonda_gastos/abarrotes_gastos nunca tuvieron NINGÚN rastro de quién
-- registró el gasto (a diferencia de ventas/citas/caja) — se agregan los
-- 3 campos completos, mismo patrón que el resto de las tablas.
alter table fonda_gastos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fonda_gastos add column if not exists empleado_nombre_cache text;
alter table fonda_gastos add column if not exists empleado_rol_cache text;

alter table abarrotes_gastos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_gastos add column if not exists empleado_nombre_cache text;
alter table abarrotes_gastos add column if not exists empleado_rol_cache text;

notify pgrst, 'reload schema';
