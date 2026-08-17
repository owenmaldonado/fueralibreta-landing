-- Ganancia de Fondita se recalculaba con el platillo ACTUAL en vez de con
-- lo que costaba/valía al momento de la venta: si hoy vendes un platillo a
-- $75 sin costo puesto (ganancia = $75) y mañana le pones costo $30, todo
-- el histórico (incluida la venta de ayer) se veía recalculado a $45 de
-- ganancia. abarrotes_sale_items ya resolvía esto con costo_unitario
-- (snapshot al cobrar) — este archivo agrega el mismo patrón a
-- fonda_pedido_items, más precio_unitario (el precio de Fondita SÍ podía
-- moverse retroactivo porque nunca se guardaba por línea).
--
-- Pega este archivo en Supabase → SQL Editor → New query → Run. Es seguro
-- volver a correrlo (usa IF NOT EXISTS).

alter table fonda_pedido_items add column if not exists precio_unitario numeric(10, 2);
alter table fonda_pedido_items add column if not exists costo_unitario numeric(10, 2);
