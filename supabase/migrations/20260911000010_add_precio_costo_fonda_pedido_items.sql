-- Agregar columnas precio_unitario y costo_unitario a fonda_pedido_items
-- que faltaban en la tabla original. Estas se usan para registrar el precio
-- y costo de cada item al momento de la venta (para análisis de ganancia).

alter table fonda_pedido_items add column precio_unitario numeric default 0;
alter table fonda_pedido_items add column costo_unitario numeric default 0;
