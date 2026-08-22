-- Owen reporta: tras tocar RLS a mano en el SQL editor de Supabase (para
-- resolver "permission denied for view barberia_citas_publicas" / 403 en
-- GET .../barberia_citas_publicas), una cita creada desde /b/[slug] (POST
-- /api/public/citas, anon key) deja de aparecer en el panel del dueño hasta
-- que refresca manualmente. Los cambios hechos a mano fueron:
--   - negocios: se dejó una sola policy de select correcta
--     (is_active=true or owner_id=auth.uid()) — esta SÍ coincide con la
--     original de 20260815000000_esquema.sql, no se toca.
--   - barberia_citas / barberia_clientes: RLS DESHABILITADO por completo
--     "para revertir".
--   - grants amplios (select/all) a anon/authenticated/service_role sobre,
--     entre otras, una vista "negocios_publicas" — esa vista NUNCA existió
--     en este esquema (solo existe la tabla `negocios`, con su policy de
--     select ya pública para is_active=true), así que ese GRANT no hace
--     nada útil y es una pista de que se estaba trabajando a ciegas contra
--     el proyecto real sin este archivo como referencia.
--
-- Diagnóstico: 20260815000000_esquema.sql YA definía el diseño correcto
-- para este flujo completo (insert público en barberia_citas con
-- estado='pendiente' + negocio activo, select/update solo para el dueño,
-- clientes nunca expuestos directo a anon) y YA agregaba barberia_citas a
-- la publication `supabase_realtime` (línea ~768). Con RLS deshabilitado
-- por completo, Realtime debería seguir entregando (sin RLS no hay
-- restricción), así que el síntoma real más probable es que la tabla haya
-- quedado FUERA de la publication `supabase_realtime` en el proyecto real
-- — un toggle de "Enable Realtime" en el Table Editor es independiente del
-- de RLS y es fácil apagarlo sin querer al estar reasignando permisos a
-- mano. Este archivo re-aplica TODO el estado original de forma idempotente
-- (mismo patrón que 20260831000000_gastos_trazabilidad_reload.sql: este
-- repo no corre `supabase db push` en CI, así que cualquier drift entre
-- este archivo y el proyecto real solo se corrige pegando el SQL a mano en
-- el SQL Editor o re-aplicando las migraciones).

alter table barberia_citas enable row level security;
alter table barberia_clientes enable row level security;

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

drop policy if exists "barberia_clientes_owner" on barberia_clientes;
create policy "barberia_clientes_owner" on barberia_clientes for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "barberia_clientes_admin_all" on barberia_clientes;
create policy "barberia_clientes_admin_all" on barberia_clientes for all using (is_admin()) with check (is_admin());

-- anon NUNCA debe tener acceso directo a barberia_clientes (nombre/teléfono
-- de TODOS los clientes del negocio) — el único camino público es
-- find_or_create_barberia_cliente/get_citas_por_telefono, security definer,
-- que devuelven solo lo mínimo. El "grant all a anon" hecho a mano abría
-- ese directorio completo a cualquier visitante; se revoca aquí.
revoke all on barberia_clientes from anon;
revoke all on barberia_citas from anon;
-- El insert público real sigue funcionando: RLS ya lo permite (policy de
-- arriba) y el grant de tabla que sí hace falta para eso es INSERT, no ALL.
grant insert on barberia_citas to anon;
grant select on barberia_citas_publicas to anon, authenticated;

-- Re-asegura que barberia_citas esté en la publication de Realtime — ver
-- diagnóstico arriba. Mismo guard idempotente que el resto del esquema
-- (no truena si ya estaba, no duplica si se corre dos veces).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'barberia_citas'
  ) then
    alter publication supabase_realtime add table barberia_citas;
  end if;
end $$;

notify pgrst, 'reload schema';
