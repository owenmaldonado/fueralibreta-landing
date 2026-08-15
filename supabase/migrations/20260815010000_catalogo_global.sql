-- Catálogo global de productos por código de barras — compartido entre
-- TODOS los negocios (sin negocio_id): si alguien ya escaneó "Sabritas
-- 45g" en su tienda, la siguiente cuenta que escanee el mismo código en
-- OTRO negocio ya no tiene que escribir el nombre a mano. Los precios/
-- costos/stock siguen siendo 100% privados por negocio en
-- abarrotes_productos (RLS por negocio_id) — esta tabla NUNCA guarda
-- precio, solo nombre/marca/presentacion.
create table if not exists catalogo_global (
  codigo_barras text primary key,
  nombre text not null,
  marca text,
  presentacion text,
  veces_usado integer not null default 1,
  created_at timestamptz not null default now()
);

alter table catalogo_global enable row level security;

-- Cualquier cuenta logueada puede leer y sumar códigos nuevos — es
-- información pública dentro de la app (nombre de producto genérico, no
-- un dato sensible del negocio). Nadie autenticado normal puede EDITAR ni
-- BORRAR una entrada ya existente (sin policy de update/delete para
-- "authenticated" -> RLS deniega por default): así un negocio no puede
-- pisarle el nombre a otro por error o a propósito. Editar/borrar es solo
-- admin, vía service_role desde /api/admin/catalogo — mismo patrón que
-- /api/admin/negocios/[id].
drop policy if exists "catalogo_global_select" on catalogo_global;
create policy "catalogo_global_select" on catalogo_global for select
  using (auth.uid() is not null);

drop policy if exists "catalogo_global_insert" on catalogo_global;
create policy "catalogo_global_insert" on catalogo_global for insert
  with check (auth.uid() is not null);

-- Mismo patrón que negocio_empleados_admin_all/auditoria_pin_admin_all:
-- además de la ruta con service_role, el panel /admin puede leer/escribir
-- directo con la sesión normal del admin si is_admin() es cierto.
drop policy if exists "catalogo_global_admin_all" on catalogo_global;
create policy "catalogo_global_admin_all" on catalogo_global for all
  using (is_admin()) with check (is_admin());

-- SEED: todo lo que ya existe en abarrotes_productos, sin duplicar
-- codigo_barras. Es la ÚNICA tabla de las 3 verticales con un campo de
-- código de barras real — barberia_productos y fonda_platillos no se
-- venden por código de barras, así que no aplica. Tampoco tiene columnas
-- marca/presentacion todavía (el formulario de Inventario nunca las
-- pidió — no se inventó un formulario nuevo para esta migración), así
-- que se seedean en null; se llenan solas el día que algún formulario sí
-- las pida y haga upsert sobre el mismo código.
--
-- codigoInput vacío se autogenera como número random de 10 dígitos (ver
-- ProductoForm en app/app/inventario/page.tsx) — esos "códigos" fantasma
-- también entran aquí porque no hay forma confiable de distinguirlos de
-- un código corto real; se pueden borrar a mano desde /admin/catalogo si
-- estorban.
insert into catalogo_global (codigo_barras, nombre, marca, presentacion)
select distinct on (codigo) codigo, nombre, null::text, null::text
from abarrotes_productos
where codigo is not null and codigo <> ''
order by codigo
on conflict (codigo_barras) do nothing;

notify pgrst, 'reload schema';
