-- Blindaje contra el drift de "empleado_rol_cache no encontrada" (PGRST204)
-- que ya nos pasó 3 veces (barberia_citas/barberia_caja/fonda_pedidos/
-- abarrotes_ventas en 20260907000000, fonda_gastos/abarrotes_gastos en
-- 20260831000000, abarrotes_fiados en 20260910000000): siempre por la misma
-- causa — este repo NO corre `supabase db push` en CI, las migraciones se
-- pegan a mano en el SQL Editor, y es fácil que una se quede a medias o que
-- el schema cache de PostgREST no se refresque.
--
-- Esta migración consolida en UN solo archivo, idempotente de principio a
-- fin (add column if not exists, nada que pueda tronar si ya corrió antes
-- parcial o completa), TODAS las columnas empleado_id/empleado_nombre_cache/
-- empleado_rol_cache que el código realmente manda en algún insert/update
-- (ver lib/data.ts y los wizards de Cerrar Turno/Día) — para que, de aquí
-- en adelante, ante cualquier duda de "¿está aplicado esto en prod?" haya
-- UN solo archivo que correr y quede resuelto sin importar qué tan viejo
-- esté el proyecto real.
--
-- NO se borraron las migraciones de emergencia anteriores (20260831000000,
-- 20260907000000, 20260910000000): son idempotentes, no hacen daño dejarlas,
-- y borrarlas / intentar "supabase migration repair" contra el proyecto real
-- es una operación que puede desincronizar el historial de migraciones si
-- el proyecto ya las tiene registradas como aplicadas — ver la respuesta
-- fuera de este archivo para el porqué no se hizo aquí.
--
-- negocio_empleados NO lleva estas columnas: es la tabla de identidad del
-- empleado (nombre, rol, pin_hash) — el resto de las tablas la REFERENCIAN
-- vía empleado_id, no le corresponde tenerse a sí misma.
--
-- fonda_caja / abarrotes_caja NO EXISTEN como tablas — no son parte de este
-- blindaje porque nunca fueron parte del esquema real (ver conversación:
-- los movimientos de fonda/abarrotes van a fonda_pedidos/fonda_gastos y
-- abarrotes_ventas/abarrotes_gastos, no a una "caja" genérica como en
-- barbería).

-- ---- Tablas con badge "Hecho por" (empleado_id + nombre + ROL) ----
alter table barberia_citas add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table barberia_citas add column if not exists empleado_nombre_cache text;
alter table barberia_citas add column if not exists empleado_rol_cache text;

alter table barberia_caja add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table barberia_caja add column if not exists empleado_nombre_cache text;
alter table barberia_caja add column if not exists empleado_rol_cache text;

alter table fonda_pedidos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fonda_pedidos add column if not exists empleado_nombre_cache text;
alter table fonda_pedidos add column if not exists empleado_rol_cache text;

alter table fonda_gastos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fonda_gastos add column if not exists empleado_nombre_cache text;
alter table fonda_gastos add column if not exists empleado_rol_cache text;

alter table abarrotes_ventas add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_ventas add column if not exists empleado_nombre_cache text;
alter table abarrotes_ventas add column if not exists empleado_rol_cache text;

alter table abarrotes_gastos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_gastos add column if not exists empleado_nombre_cache text;
alter table abarrotes_gastos add column if not exists empleado_rol_cache text;

alter table abarrotes_fiados add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_fiados add column if not exists empleado_nombre_cache text;
alter table abarrotes_fiados add column if not exists empleado_rol_cache text;

-- ---- Bitácoras de cierre (empleado_id + nombre, SIN rol — write-only,
-- nada las lee todavía, ver componentes *-cerrar-turno.tsx/-cerrar-dia.tsx) ----
alter table barberia_cortes add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table barberia_cortes add column if not exists empleado_nombre_cache text;

alter table fondita_cortes add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fondita_cortes add column if not exists empleado_nombre_cache text;

alter table abarrotera_cortes add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotera_cortes add column if not exists empleado_nombre_cache text;

notify pgrst, 'reload schema';
