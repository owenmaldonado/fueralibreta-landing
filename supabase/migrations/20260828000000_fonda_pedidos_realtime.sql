-- PR #119 agregó escucharPedidosEnVivo/suscribirseAPedidosEnVivo (lib/
-- session.ts) para que un pedido cobrado desde OTRO dispositivo (ej. un
-- vendedor con PIN en otra tablet) llegara en vivo al dashboard del dueño,
-- mismo patrón que ya existía para barberia_citas y abarrotes_ventas. Pero
-- a diferencia de esas dos tablas (agregadas a la publication en
-- 20260815000000_esquema.sql, líneas 768 y 1101), fonda_pedidos nunca se
-- agregó a supabase_realtime — el canal se suscribía sin error (Postgres no
-- avisa si escuchas una tabla fuera de la publication), pero nunca recibía
-- ni un solo evento. Por eso el fix de PR #119 no se notó: el código estaba
-- bien, pero Postgres jamás publicaba los cambios de esa tabla.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fonda_pedidos'
  ) then
    alter publication supabase_realtime add table fonda_pedidos;
  end if;
end $$;
