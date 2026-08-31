-- Agregar columnas precio_unitario y costo_unitario a fonda_pedido_items
-- que faltaban en la tabla original. Estas se usan para registrar el precio
-- y costo de cada item al momento de la venta (para análisis de ganancia).

-- `if not exists` (agregado en la auditoría previa al lanzamiento): el
-- esquema base ya crea estas dos columnas, así que correr las migraciones
-- desde cero en una base limpia tronaba justo aquí con
--   ERROR: column "precio_unitario" of relation "fonda_pedido_items" already exists
-- y ninguna de las migraciones siguientes se aplicaba. En la base de
-- producción no se nota (la columna ya está y esta migración ya pasó), pero
-- levantar un proyecto nuevo o correr `supabase db reset` era imposible.
alter table fonda_pedido_items add column if not exists precio_unitario numeric default 0;
alter table fonda_pedido_items add column if not exists costo_unitario numeric default 0;
