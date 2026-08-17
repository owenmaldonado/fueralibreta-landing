-- Cargo extra por línea de pedido de Fondita (ej. envase "para llevar" +$10)
-- — separado de nota (comentario libre) y de variante_nombre (proteína
-- elegida), para que el ticket pueda mostrar "platillo c/ variante +$10
-- concepto" sin mezclar los tres. extra_monto se suma UNA VEZ al total de
-- la línea, no se multiplica por cantidad (ver itemToRow en lib/data.ts).
--
-- Pega este archivo en Supabase → SQL Editor → New query → Run. Es seguro
-- volver a correrlo (usa IF NOT EXISTS).

alter table fonda_pedido_items add column if not exists extra_concepto text;
alter table fonda_pedido_items add column if not exists extra_monto numeric(10, 2);
