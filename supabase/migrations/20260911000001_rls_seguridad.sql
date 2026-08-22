-- Auditoría de seguridad RLS (Owen reporta: el dashboard de Supabase
-- muestra TODAS las tablas como "Public"/sin restricción).
--
-- Verificado contra el historial de migraciones de este repo: NO es una
-- falsa alarma. 20260815000000_esquema.sql SIEMPRE definió Row Level
-- Security correcto para cada tabla (RLS habilitado + policies por
-- negocio_id vía is_negocio_owner()/is_admin()), pero
-- 20260902000000_fix_citas_publicas_rls_realtime.sql documenta que en
-- algún punto SE DESHABILITÓ RLS A MANO en el Table Editor/SQL Editor del
-- proyecto real sobre barberia_citas y barberia_clientes ("para revertir"
-- un error distinto), junto con GRANTs amplios a anon/authenticated sobre
-- varias tablas. Ese incidente se corrigió para esas 2 tablas puntuales en
-- esa migración — pero si el mismo Table Editor se usó para "arreglar"
-- algo más en otras tablas (o si 20260815000000_esquema.sql, que es
-- gigante, nunca terminó de correr completo la primera vez — mismo
-- síndrome que ya vimos con columnas empleado_*), el resultado es
-- exactamente lo que describe el reporte: RLS apagado en todas.
--
-- Este archivo NO inventa un esquema de seguridad nuevo — usa exactamente
-- las mismas funciones/policies que 20260815000000_esquema.sql y el resto
-- de migraciones ya definen, solo que consolidadas en un único archivo
-- 100% idempotente (alter table ... enable row level security es un no-op
-- si ya estaba habilitado; drop policy if exists + create policy es
-- seguro de repetir) para poder re-aplicar TODO el estado correcto de una
-- sola pasada sin tener que adivinar cuál migración sí llegó a correr.
--
-- Sobre "auth.uid() = negocio_id" / current_setting() que proponía el
-- reporte: negocio_id es el uuid del NEGOCIO, no del usuario — no hay
-- forma de que sean iguales. Tampoco se usa current_setting(): esa técnica
-- (variables de sesión de Postgres) no es cómo Supabase Auth expone la
-- identidad a RLS. La app ya usa auth.uid() (función nativa de Supabase
-- que da el uuid del usuario autenticado) a través de is_negocio_owner(),
-- definida en 20260815000000_esquema.sql:
--
--   is_negocio_owner(p_negocio_id) = TRUE si auth.uid() es el owner_id del
--   negocio, O si auth.uid() coincide con negocio_empleados.user_id de un
--   empleado activo de ese negocio (hoy siempre falso: los empleados PIN
--   no tienen cuenta propia — ver lib/empleados.ts — pero la función ya
--   los soporta si algún día se agrega login propio por empleado).
--
-- Nada de esto rompe la anon key de la landing/reserva pública: se
-- re-afirman explícitamente las policies public_select/public_insert que
-- YA existían para negocios activos (barberia_servicios/horario/
-- excepciones, barberia_citas insert, la vista barberia_citas_publicas,
-- contactos, leads, consentimientos) — ver cada sección abajo.

-- ============================================================================
-- NEGOCIOS
-- ============================================================================
alter table negocios enable row level security;

drop policy if exists "negocios_select" on negocios;
create policy "negocios_select" on negocios for select
  using (is_active = true or owner_id = auth.uid());

drop policy if exists "negocios_insert" on negocios;
create policy "negocios_insert" on negocios for insert
  with check (owner_id = auth.uid());

drop policy if exists "negocios_update" on negocios;
create policy "negocios_update" on negocios for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Sin policy de delete a propósito: un negocio se pausa (is_active=false),
-- no se borra desde el cliente. /admin borra con service_role (salta RLS).
drop policy if exists "negocios_admin_all" on negocios;
create policy "negocios_admin_all" on negocios for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- MULTIUSUARIO POR NEGOCIO (empleados, PIN)
-- ============================================================================
alter table negocio_empleados enable row level security;
alter table auditoria_pin enable row level security;
alter table negocio_pin_dueno enable row level security;

drop policy if exists "negocio_empleados_owner" on negocio_empleados;
create policy "negocio_empleados_owner" on negocio_empleados for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "negocio_empleados_admin_all" on negocio_empleados;
create policy "negocio_empleados_admin_all" on negocio_empleados for all using (is_admin()) with check (is_admin());

drop policy if exists "auditoria_pin_select" on auditoria_pin;
create policy "auditoria_pin_select" on auditoria_pin for select
  using (is_negocio_owner(negocio_id));
drop policy if exists "auditoria_pin_insert" on auditoria_pin;
create policy "auditoria_pin_insert" on auditoria_pin for insert
  with check (is_negocio_owner(negocio_id));
drop policy if exists "auditoria_pin_admin_all" on auditoria_pin;
create policy "auditoria_pin_admin_all" on auditoria_pin for all using (is_admin()) with check (is_admin());

-- negocio_pin_dueno NO lleva ninguna policy a propósito: con RLS
-- habilitado y CERO policies, Postgres niega TODO acceso directo a
-- cualquier rol que no sea el dueño de la tabla (ni siquiera el dueño del
-- negocio puede leer su propio pin_hash por PostgREST) — el único camino
-- es vía las funciones security definer set_pin_dueno/verificar_pin_dueno/
-- pin_dueno_configurado/borrar_pin_dueno (20260815000000_esquema.sql), que
-- validan is_negocio_owner() por dentro y nunca regresan el hash. No se
-- agrega ninguna policy aquí — agregar una sería DEBILITAR esta tabla, no
-- protegerla.

-- ============================================================================
-- BARBERÍA
-- ============================================================================
alter table barberia_servicios enable row level security;
alter table barberia_horario enable row level security;
alter table barberia_excepciones enable row level security;
alter table barberia_clientes enable row level security;
alter table barberia_citas enable row level security;
alter table barberia_caja enable row level security;
alter table barberia_productos enable row level security;
alter table barberia_cortes enable row level security;

drop policy if exists "barberia_servicios_owner" on barberia_servicios;
create policy "barberia_servicios_owner" on barberia_servicios for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "barberia_servicios_public_select" on barberia_servicios;
create policy "barberia_servicios_public_select" on barberia_servicios for select
  using (exists (select 1 from negocios n where n.id = negocio_id and n.is_active));
drop policy if exists "barberia_servicios_admin_all" on barberia_servicios;
create policy "barberia_servicios_admin_all" on barberia_servicios for all using (is_admin()) with check (is_admin());

drop policy if exists "barberia_horario_owner" on barberia_horario;
create policy "barberia_horario_owner" on barberia_horario for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "barberia_horario_public_select" on barberia_horario;
create policy "barberia_horario_public_select" on barberia_horario for select
  using (exists (select 1 from negocios n where n.id = negocio_id and n.is_active));
drop policy if exists "barberia_horario_admin_all" on barberia_horario;
create policy "barberia_horario_admin_all" on barberia_horario for all using (is_admin()) with check (is_admin());

drop policy if exists "barberia_excepciones_owner" on barberia_excepciones;
create policy "barberia_excepciones_owner" on barberia_excepciones for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "barberia_excepciones_public_select" on barberia_excepciones;
create policy "barberia_excepciones_public_select" on barberia_excepciones for select
  using (exists (select 1 from negocios n where n.id = negocio_id and n.is_active));
drop policy if exists "barberia_excepciones_admin_all" on barberia_excepciones;
create policy "barberia_excepciones_admin_all" on barberia_excepciones for all using (is_admin()) with check (is_admin());

-- barberia_clientes: SIN policy pública. Nombre/teléfono de todos los
-- clientes del negocio nunca debe ser legible por anon (ver comentario en
-- 20260902000000_fix_citas_publicas_rls_realtime.sql) — la reserva pública
-- resuelve/crea cliente vía find_or_create_barberia_cliente (security
-- definer), no leyendo esta tabla directo.
drop policy if exists "barberia_clientes_owner" on barberia_clientes;
create policy "barberia_clientes_owner" on barberia_clientes for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "barberia_clientes_admin_all" on barberia_clientes;
create policy "barberia_clientes_admin_all" on barberia_clientes for all using (is_admin()) with check (is_admin());

drop policy if exists "barberia_citas_owner_select" on barberia_citas;
create policy "barberia_citas_owner_select" on barberia_citas for select
  using (is_negocio_owner(negocio_id));
drop policy if exists "barberia_citas_owner_write" on barberia_citas;
create policy "barberia_citas_owner_write" on barberia_citas for update
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "barberia_citas_public_insert" on barberia_citas;
create policy "barberia_citas_public_insert" on barberia_citas for insert
  with check (
    estado = 'pendiente'
    and exists (select 1 from negocios n where n.id = negocio_id and n.is_active)
  );
drop policy if exists "barberia_citas_admin_all" on barberia_citas;
create policy "barberia_citas_admin_all" on barberia_citas for all using (is_admin()) with check (is_admin());

-- Defensa en profundidad (mismo incidente de 20260902000000): anon solo
-- necesita poder INSERTAR una cita pública y leer la vista sin datos
-- personales — nunca SELECT/UPDATE/DELETE directo sobre las tablas reales.
revoke all on barberia_clientes from anon;
revoke all on barberia_citas from anon;
grant insert on barberia_citas to anon;

create or replace view barberia_citas_publicas as
  select negocio_id, fecha, hora, estado
  from barberia_citas
  where estado <> 'cancelada';
grant select on barberia_citas_publicas to anon, authenticated;

drop policy if exists "barberia_caja_owner" on barberia_caja;
create policy "barberia_caja_owner" on barberia_caja for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "barberia_caja_admin_all" on barberia_caja;
create policy "barberia_caja_admin_all" on barberia_caja for all using (is_admin()) with check (is_admin());

drop policy if exists "barberia_productos_owner" on barberia_productos;
create policy "barberia_productos_owner" on barberia_productos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "barberia_productos_admin_all" on barberia_productos;
create policy "barberia_productos_admin_all" on barberia_productos for all using (is_admin()) with check (is_admin());

drop policy if exists "barberia_cortes_owner" on barberia_cortes;
create policy "barberia_cortes_owner" on barberia_cortes for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "barberia_cortes_admin_all" on barberia_cortes;
create policy "barberia_cortes_admin_all" on barberia_cortes for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- FONDA (Fondita) — sin reserva pública, todo dueño/empleado
-- ============================================================================
alter table fonda_platillos enable row level security;
alter table fonda_variantes enable row level security;
alter table fondita_menu_dia enable row level security;
alter table fonda_pedidos enable row level security;
alter table fonda_pedido_items enable row level security;
alter table fonda_gastos enable row level security;
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

drop policy if exists "fondita_menu_dia_owner" on fondita_menu_dia;
create policy "fondita_menu_dia_owner" on fondita_menu_dia for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "fondita_menu_dia_admin_all" on fondita_menu_dia;
create policy "fondita_menu_dia_admin_all" on fondita_menu_dia for all using (is_admin()) with check (is_admin());

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

-- ============================================================================
-- ABARROTES (Abarrotera)
-- ============================================================================
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
drop policy if exists "abarrotes_productos_admin_all" on abarrotes_productos;
create policy "abarrotes_productos_admin_all" on abarrotes_productos for all using (is_admin()) with check (is_admin());

drop policy if exists "abarrotes_lotes_owner" on abarrotes_lotes;
create policy "abarrotes_lotes_owner" on abarrotes_lotes for all
  using (exists (select 1 from abarrotes_productos p where p.id = producto_id and is_negocio_owner(p.negocio_id)))
  with check (exists (select 1 from abarrotes_productos p where p.id = producto_id and is_negocio_owner(p.negocio_id)));
drop policy if exists "abarrotes_lotes_admin_all" on abarrotes_lotes;
create policy "abarrotes_lotes_admin_all" on abarrotes_lotes for all using (is_admin()) with check (is_admin());

drop policy if exists "abarrotes_ventas_owner" on abarrotes_ventas;
create policy "abarrotes_ventas_owner" on abarrotes_ventas for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "abarrotes_ventas_admin_all" on abarrotes_ventas;
create policy "abarrotes_ventas_admin_all" on abarrotes_ventas for all using (is_admin()) with check (is_admin());

drop policy if exists "abarrotes_sale_items_owner" on abarrotes_sale_items;
create policy "abarrotes_sale_items_owner" on abarrotes_sale_items for all
  using (exists (select 1 from abarrotes_ventas v where v.id = venta_id and is_negocio_owner(v.negocio_id)))
  with check (exists (select 1 from abarrotes_ventas v where v.id = venta_id and is_negocio_owner(v.negocio_id)));
drop policy if exists "abarrotes_sale_items_admin_all" on abarrotes_sale_items;
create policy "abarrotes_sale_items_admin_all" on abarrotes_sale_items for all using (is_admin()) with check (is_admin());

drop policy if exists "abarrotes_fiados_owner" on abarrotes_fiados;
create policy "abarrotes_fiados_owner" on abarrotes_fiados for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "abarrotes_fiados_admin_all" on abarrotes_fiados;
create policy "abarrotes_fiados_admin_all" on abarrotes_fiados for all using (is_admin()) with check (is_admin());

drop policy if exists "abarrotes_fiado_movimientos_owner" on abarrotes_fiado_movimientos;
create policy "abarrotes_fiado_movimientos_owner" on abarrotes_fiado_movimientos for all
  using (exists (select 1 from abarrotes_fiados f where f.id = fiado_id and is_negocio_owner(f.negocio_id)))
  with check (exists (select 1 from abarrotes_fiados f where f.id = fiado_id and is_negocio_owner(f.negocio_id)));
drop policy if exists "abarrotes_fiado_movimientos_admin_all" on abarrotes_fiado_movimientos;
create policy "abarrotes_fiado_movimientos_admin_all" on abarrotes_fiado_movimientos for all using (is_admin()) with check (is_admin());

drop policy if exists "abarrotes_apartados_owner" on abarrotes_apartados;
create policy "abarrotes_apartados_owner" on abarrotes_apartados for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "abarrotes_apartados_admin_all" on abarrotes_apartados;
create policy "abarrotes_apartados_admin_all" on abarrotes_apartados for all using (is_admin()) with check (is_admin());

drop policy if exists "abarrotes_gastos_owner" on abarrotes_gastos;
create policy "abarrotes_gastos_owner" on abarrotes_gastos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "abarrotes_gastos_admin_all" on abarrotes_gastos;
create policy "abarrotes_gastos_admin_all" on abarrotes_gastos for all using (is_admin()) with check (is_admin());

drop policy if exists "abarrotera_cortes_owner" on abarrotera_cortes;
create policy "abarrotera_cortes_owner" on abarrotera_cortes for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "abarrotera_cortes_admin_all" on abarrotera_cortes;
create policy "abarrotera_cortes_admin_all" on abarrotera_cortes for all using (is_admin()) with check (is_admin());

drop policy if exists "abarrotera_mermas_owner" on abarrotera_mermas;
create policy "abarrotera_mermas_owner" on abarrotera_mermas for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));
drop policy if exists "abarrotera_mermas_admin_all" on abarrotera_mermas;
create policy "abarrotera_mermas_admin_all" on abarrotera_mermas for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- CONTENIDO PÚBLICO DE LA LANDING (anon solo puede insertar, nunca leer)
-- ============================================================================
alter table contactos enable row level security;
drop policy if exists "contactos_public_insert" on contactos;
create policy "contactos_public_insert" on contactos for insert
  to anon
  with check (true);
drop policy if exists "contactos_admin_all" on contactos;
create policy "contactos_admin_all" on contactos for all using (is_admin()) with check (is_admin());

alter table leads enable row level security;
drop policy if exists "leads_public_insert" on leads;
create policy "leads_public_insert" on leads for insert
  to anon
  with check (estado = 'nuevo' and origen = 'landing');
drop policy if exists "leads_admin_all" on leads;
create policy "leads_admin_all" on leads for all using (is_admin()) with check (is_admin());

-- consentimientos tenía 2 policies de insert con nombre distinto
-- (consentimientos_public_insert de 20260821000000_consentimientos.sql,
-- muy permisiva: to anon with check(true); consentimientos_insert_anon de
-- 20260821000000_consentimientos_anonimo.sql, más estricta: to anon,
-- authenticated with check(negocio_id is null)) — al tener nombres
-- distintos ambas pudieron quedar activas a la vez, con la permisiva
-- volviendo redundante a la estricta. Se consolida en una sola, la
-- estricta, que es la que de verdad coincide con cómo ConsentBanner.tsx
-- llama a este insert hoy (negocio_id siempre null).
alter table consentimientos enable row level security;
drop policy if exists "consentimientos_public_insert" on consentimientos;
drop policy if exists "consentimientos_insert_anon" on consentimientos;
create policy "consentimientos_insert_anon" on consentimientos for insert
  to anon, authenticated
  with check (negocio_id is null);
drop policy if exists "consentimientos_admin_all" on consentimientos;
create policy "consentimientos_admin_all" on consentimientos for all
  using (is_admin()) with check (is_admin());

alter table catalogo_global enable row level security;
drop policy if exists "catalogo_global_select" on catalogo_global;
create policy "catalogo_global_select" on catalogo_global for select
  using (auth.uid() is not null);
drop policy if exists "catalogo_global_insert" on catalogo_global;
create policy "catalogo_global_insert" on catalogo_global for insert
  with check (auth.uid() is not null);
drop policy if exists "catalogo_global_admin_all" on catalogo_global;
create policy "catalogo_global_admin_all" on catalogo_global for all
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- CUENTA / ADMIN / OTROS MÓDULOS
-- ============================================================================
alter table profiles enable row level security;
drop policy if exists "profiles_self_select" on profiles;
create policy "profiles_self_select" on profiles for select
  using (id = auth.uid());
drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
drop policy if exists "profiles_admin_all" on profiles;
create policy "profiles_admin_all" on profiles for all
  using (is_admin()) with check (is_admin());

-- Guard del trigger que evita que profiles_self_update se use para
-- auto-otorgarse role='admin'/plan='pro'/is_banned=false (20260826000000_
-- telefono_contacto.sql) — se re-afirma junto con la policy de arriba,
-- porque una sin la otra deja abierta la escalada de privilegios.
create or replace function prevent_profile_self_privileged_change()
returns trigger
language plpgsql
as $$
begin
  if (
    new.role is distinct from old.role
    or new.plan is distinct from old.plan
    or new.is_banned is distinct from old.is_banned
    or new.email is distinct from old.email
  ) and auth.role() <> 'service_role' then
    raise exception 'Solo un administrador puede cambiar el rol, plan, baneo o email de un perfil';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_privileged_fields_guard on profiles;
create trigger profiles_privileged_fields_guard
  before update on profiles
  for each row execute function prevent_profile_self_privileged_change();

alter table mis_apps enable row level security;
drop policy if exists "mis_apps_admin_all" on mis_apps;
create policy "mis_apps_admin_all" on mis_apps for all using (is_admin()) with check (is_admin());

alter table rentas_propiedades enable row level security;
drop policy if exists "rentas_propiedades_owner" on rentas_propiedades;
create policy "rentas_propiedades_owner" on rentas_propiedades for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
drop policy if exists "rentas_propiedades_admin_all" on rentas_propiedades;
create policy "rentas_propiedades_admin_all" on rentas_propiedades for all using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';
