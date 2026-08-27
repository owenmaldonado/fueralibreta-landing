-- Productos de Barbería vendibles, con ganancia real (mismo modelo que
-- Abarrotera). Hasta ahora barberia_productos solo llevaba stock/mínimo:
-- servían para "Consumir / Eliminar del inventario", nunca para vender —
-- un gel vendido al cliente había que capturarlo a mano como una venta
-- suelta en Caja, sin descontar stock y sin saber cuánto se ganó.
--
-- precio  = a cuánto se vende (null = producto de uso interno, no se vende)
-- costo   = a cuánto se compró (null = no se sabe, no aporta margen)
--
-- Ambas nullable a propósito: un negocio que ya tenía productos cargados
-- sigue funcionando igual hasta que decida ponerles precio.
alter table barberia_productos add column if not exists precio numeric(10, 2);
alter table barberia_productos add column if not exists costo numeric(10, 2);

-- Costo de la mercancía vendida en ESE movimiento de caja — snapshot al
-- momento de la venta, para que editar el costo del producto después no
-- reescriba la ganancia histórica (mismo criterio que costo_unitario en
-- abarrotes_sale_items y fonda_pedido_items).
--
-- Solo aplica a tipo='venta' de productos. Un corte (servicio) no tiene
-- costo de mercancía: se queda null y aporta margen completo, igual que
-- hoy.
alter table barberia_caja add column if not exists costo numeric(10, 2);
