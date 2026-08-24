-- Hotfix: Mismo problema que 20260911000002_rls_hotfix_abarrotes.sql pero
-- para fonda: Table Editor sigue marcando UNRESTRICTED en fonda_platillos,
-- fonda_variantes, fonda_pedidos, fonda_pedido_items, fonda_gastos,
-- fondita_menu_dia, fondita_cortes, fondita_mermas después de correr
-- 20260911000001_rls_seguridad.sql (ese archivo SÍ incluye "enable row
-- level security" + policies para todas éstas — se verificó línea por línea).
--
-- "Unrestricted" en el Table Editor significa específicamente
-- rowsecurity=false en pg_class para esa tabla — no "sin policies", sino
-- RLS deshabilitado del todo. Como el archivo anterior las cubre pero el
-- proyecto real no lo refleja, lo más probable es que ese statement en
-- particular no haya llegado a aplicarse contra prod (falla a medias del
-- paste en el SQL Editor, mismo síndrome que ya vimos con columnas
-- empleado_* — este repo no corre `supabase db push` en CI). Este archivo
-- es chico y autocontenido a propósito: solo estas tablas de fonda, para poder
-- correrlo solo si el archivo grande vuelve a fallar a medias.

alter table fonda_platillos enable row level security;
alter table fonda_variantes enable row level security;
alter table fonda_pedidos enable row level security;
alter table fonda_pedido_items enable row level security;
alter table fonda_gastos enable row level security;
alter table fondita_menu_dia enable row level security;
alter table fondita_cortes enable row level security;
alter table fondita_mermas enable row level security;

drop policy if exists "fonda_platillos_owner" on fonda_platillos;
create policy "fonda_platillos_owner" on fonda_platillos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "fonda_platillos_admin_all" on fonda_platillos;
create policy "fonda_platillos_admin_all" on fonda_platillos for all using (is_admin()) with check (is_admin());

drop policy if exists "fonda_variantes_owner" on fonda_variantes;
create policy "fonda_variantes_owner" on fonda_variantes for all
  using (exists (select 1 from fonda_platillos p where p.id = producto_id and is_negocio_owner(p.negocio_id)))
  with check (exists (select 1 from fonda_platillos p where p.id = producto_id and is_negocio_owner(p.negocio_id)));
drop policy if exists "fonda_variantes_admin_all" on fonda_variantes;
create policy "fonda_variantes_admin_all" on fonda_variantes for all using (is_admin()) with check (is_admin());

drop policy if exists "fonda_pedidos_owner" on fonda_pedidos;
create policy "fonda_pedidos_owner" on fonda_pedidos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "fonda_pedidos_admin_all" on fonda_pedidos;
create policy "fonda_pedidos_admin_all" on fonda_pedidos for all using (is_admin()) with check (is_admin());

drop policy if exists "fonda_pedido_items_owner" on fonda_pedido_items;
create policy "fonda_pedido_items_owner" on fonda_pedido_items for all
  using (exists (select 1 from fonda_pedidos p where p.id = pedido_id and is_negocio_owner(p.negocio_id)))
  with check (exists (select 1 from fonda_pedidos p where p.id = pedido_id and is_negocio_owner(p.negocio_id)));
drop policy if exists "fonda_pedido_items_admin_all" on fonda_pedido_items;
create policy "fonda_pedido_items_admin_all" on fonda_pedido_items for all using (is_admin()) with check (is_admin());

drop policy if exists "fonda_gastos_owner" on fonda_gastos;
create policy "fonda_gastos_owner" on fonda_gastos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "fonda_gastos_admin_all" on fonda_gastos;
create policy "fonda_gastos_admin_all" on fonda_gastos for all using (is_admin()) with check (is_admin());

drop policy if exists "fondita_menu_dia_owner" on fondita_menu_dia;
create policy "fondita_menu_dia_owner" on fondita_menu_dia for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "fondita_menu_dia_admin_all" on fondita_menu_dia;
create policy "fondita_menu_dia_admin_all" on fondita_menu_dia for all using (is_admin()) with check (is_admin());

drop policy if exists "fondita_cortes_owner" on fondita_cortes;
create policy "fondita_cortes_owner" on fondita_cortes for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "fondita_cortes_admin_all" on fondita_cortes;
create policy "fondita_cortes_admin_all" on fondita_cortes for all using (is_admin()) with check (is_admin());

drop policy if exists "fondita_mermas_owner" on fondita_mermas;
create policy "fondita_mermas_owner" on fondita_mermas for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "fondita_mermas_admin_all" on fondita_mermas;
create policy "fondita_mermas_admin_all" on fondita_mermas for all using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';
