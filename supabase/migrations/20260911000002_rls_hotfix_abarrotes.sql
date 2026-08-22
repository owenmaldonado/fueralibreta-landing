-- Hotfix: Table Editor sigue marcando UNRESTRICTED en abarrotes_productos,
-- abarrotes_lotes, abarrotes_ventas, abarrotes_sale_items, abarrotes_fiados,
-- abarrotes_fiado_movimientos, abarrotes_apartados, abarrotes_gastos,
-- abarrotera_cortes, abarrotera_mermas después de correr
-- 20260911000001_rls_seguridad.sql (ese archivo SÍ incluye "enable row
-- level security" + policies para las 10 — se verificó línea por línea).
-- "Unrestricted" en el Table Editor significa específicamente
-- rowsecurity=false en pg_class para esa tabla — no "sin policies", sino
-- RLS deshabilitado del todo. Como el archivo anterior las cubre pero el
-- proyecto real no lo refleja, lo más probable es que ese statement en
-- particular no haya llegado a aplicarse contra prod (falla a medias del
-- paste en el SQL Editor, mismo síndrome que ya vimos con columnas
-- empleado_* — este repo no corre `supabase db push` en CI). Este archivo
-- es chico y autocontenido a propósito: solo estas 10 tablas, para poder
-- correrlo solo si el archivo grande vuelve a fallar a medias.
--
-- is_negocio_owner(uuid) SÍ existe y SÍ es security definer
-- (20260815000000_esquema.sql, declarada dos veces — la segunda con
-- "create or replace" agrega el OR de empleado con cuenta propia). Si no
-- existiera, cualquier CREATE POLICY que la use tronaría de inmediato con
-- "function is_negocio_owner(uuid) does not exist" — no falla en
-- silencio, así que si las policies de negocios/barbería/fonda del
-- archivo anterior sí se crearon, la función ya está ahí.
--
-- create policy IF NOT EXISTS no existe en Postgres (a diferencia de
-- create table/add column) — se usa el mismo patrón idempotente que el
-- resto del repo: drop policy if exists + create policy.

alter table abarrotes_productos enable row level security;
alter table abarrotes_lotes enable row level security;
alter table abarrotes_ventas enable row level security;
alter table abarrotes_sale_items enable row level security;
alter table abarrotes_fiados enable row level security;
alter table abarrotes_fiado_movimientos enable row level security;
alter table abarrotes_apartados enable row level security;
alter table abarrotes_gastos enable row level security;
alter table abarrotera_cortes enable row level security;
alter table abarrotera_mermas enable row level security;

drop policy if exists "abarrotes_productos_owner" on abarrotes_productos;
create policy "abarrotes_productos_owner" on abarrotes_productos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "abarrotes_lotes_owner" on abarrotes_lotes;
create policy "abarrotes_lotes_owner" on abarrotes_lotes for all
  using (exists (select 1 from abarrotes_productos p where p.id = producto_id and is_negocio_owner(p.negocio_id)))
  with check (exists (select 1 from abarrotes_productos p where p.id = producto_id and is_negocio_owner(p.negocio_id)));

drop policy if exists "abarrotes_ventas_owner" on abarrotes_ventas;
create policy "abarrotes_ventas_owner" on abarrotes_ventas for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "abarrotes_sale_items_owner" on abarrotes_sale_items;
create policy "abarrotes_sale_items_owner" on abarrotes_sale_items for all
  using (exists (select 1 from abarrotes_ventas v where v.id = venta_id and is_negocio_owner(v.negocio_id)))
  with check (exists (select 1 from abarrotes_ventas v where v.id = venta_id and is_negocio_owner(v.negocio_id)));

drop policy if exists "abarrotes_fiados_owner" on abarrotes_fiados;
create policy "abarrotes_fiados_owner" on abarrotes_fiados for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "abarrotes_fiado_movimientos_owner" on abarrotes_fiado_movimientos;
create policy "abarrotes_fiado_movimientos_owner" on abarrotes_fiado_movimientos for all
  using (exists (select 1 from abarrotes_fiados f where f.id = fiado_id and is_negocio_owner(f.negocio_id)))
  with check (exists (select 1 from abarrotes_fiados f where f.id = fiado_id and is_negocio_owner(f.negocio_id)));

drop policy if exists "abarrotes_apartados_owner" on abarrotes_apartados;
create policy "abarrotes_apartados_owner" on abarrotes_apartados for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "abarrotes_gastos_owner" on abarrotes_gastos;
create policy "abarrotes_gastos_owner" on abarrotes_gastos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "abarrotera_cortes_owner" on abarrotera_cortes;
create policy "abarrotera_cortes_owner" on abarrotera_cortes for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "abarrotera_mermas_owner" on abarrotera_mermas;
create policy "abarrotera_mermas_owner" on abarrotera_mermas for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

-- Admin (/admin) también quedaba sin acceso directo si estas policies no
-- estaban — se re-afirma igual que en 20260911000001_rls_seguridad.sql.
drop policy if exists "abarrotes_productos_admin_all" on abarrotes_productos;
create policy "abarrotes_productos_admin_all" on abarrotes_productos for all using (is_admin()) with check (is_admin());
drop policy if exists "abarrotes_lotes_admin_all" on abarrotes_lotes;
create policy "abarrotes_lotes_admin_all" on abarrotes_lotes for all using (is_admin()) with check (is_admin());
drop policy if exists "abarrotes_ventas_admin_all" on abarrotes_ventas;
create policy "abarrotes_ventas_admin_all" on abarrotes_ventas for all using (is_admin()) with check (is_admin());
drop policy if exists "abarrotes_sale_items_admin_all" on abarrotes_sale_items;
create policy "abarrotes_sale_items_admin_all" on abarrotes_sale_items for all using (is_admin()) with check (is_admin());
drop policy if exists "abarrotes_fiados_admin_all" on abarrotes_fiados;
create policy "abarrotes_fiados_admin_all" on abarrotes_fiados for all using (is_admin()) with check (is_admin());
drop policy if exists "abarrotes_fiado_movimientos_admin_all" on abarrotes_fiado_movimientos;
create policy "abarrotes_fiado_movimientos_admin_all" on abarrotes_fiado_movimientos for all using (is_admin()) with check (is_admin());
drop policy if exists "abarrotes_apartados_admin_all" on abarrotes_apartados;
create policy "abarrotes_apartados_admin_all" on abarrotes_apartados for all using (is_admin()) with check (is_admin());
drop policy if exists "abarrotes_gastos_admin_all" on abarrotes_gastos;
create policy "abarrotes_gastos_admin_all" on abarrotes_gastos for all using (is_admin()) with check (is_admin());
drop policy if exists "abarrotera_cortes_admin_all" on abarrotera_cortes;
create policy "abarrotera_cortes_admin_all" on abarrotera_cortes for all using (is_admin()) with check (is_admin());
drop policy if exists "abarrotera_mermas_admin_all" on abarrotera_mermas;
create policy "abarrotera_mermas_admin_all" on abarrotera_mermas for all using (is_admin()) with check (is_admin());

-- No toca barberia_citas_publicas, negocios, ni ninguna policy pública de
-- la landing/reserva — fuera de alcance de este hotfix.

notify pgrst, 'reload schema';
