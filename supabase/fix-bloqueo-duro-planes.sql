-- Bloqueo duro (RLS) de los límites de plan básico — imposible de saltar
-- manipulando la app, porque Postgres rechaza el INSERT directo.
--
-- Hasta ahora el límite (100 pedidos/mes, 200 productos, 100 clientes,
-- 100 citas/mes) solo vivía en la UI (lib/planes.ts + los formularios de
-- creación) — suficiente para un usuario normal, pero alguien con DevTools
-- podía llamar a supabase.from(...).insert(...) directo y saltárselo.
--
-- Diseño: 4 funciones security definer (mismo patrón que is_negocio_owner)
-- + 4 policies NUEVAS y RESTRICTIVAS, una por tabla, SOLO para INSERT.
-- No se toca ninguna policy existente:
--   - Las policies "*_owner" (for all) siguen igual — editar/borrar/ver
--     filas que YA EXISTEN nunca se bloquea, aunque el negocio esté sobre
--     el límite (si no, ni siquiera podrías corregir/cancelar algo).
--   - "as restrictive" se combina con AND sobre las policies permisivas
--     existentes (que se combinan entre sí con OR) — así esto se suma
--     como un candado extra sin reemplazar ni duplicar el check de dueño
--     que ya existe.
--   - Cada función deja pasar a is_admin() y a cualquier plan que no sea
--     'basico', igual que ya hace lib/planes.ts en el cliente.
--
-- Corre esto completo en el SQL Editor de Supabase. Es idempotente
-- (create or replace function, drop policy if exists antes de cada create).

create or replace function puede_crear_pedido(p_negocio_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_plan text;
  v_count integer;
begin
  if is_admin() then
    return true;
  end if;
  select plan into v_plan from negocios where id = p_negocio_id;
  if v_plan is distinct from 'basico' then
    return true;
  end if;
  -- Igual que pedidosDelMes en app/app/pedidos/page.tsx: cuenta TODOS los
  -- pedidos del mes calendario, sin importar estado (uno cancelado sigue
  -- contando — evita que "corregir en Gastos" se use para saltarse el tope).
  select count(*) into v_count
    from fonda_pedidos
    where negocio_id = p_negocio_id
      and fecha >= date_trunc('month', now())::date;
  return v_count < 100;
end;
$$;

create or replace function puede_crear_producto(p_negocio_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_plan text;
  v_count integer;
begin
  if is_admin() then
    return true;
  end if;
  select plan into v_plan from negocios where id = p_negocio_id;
  if v_plan is distinct from 'basico' then
    return true;
  end if;
  select count(*) into v_count from abarrotes_productos where negocio_id = p_negocio_id;
  return v_count < 200;
end;
$$;

create or replace function puede_crear_cliente(p_negocio_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_plan text;
  v_count integer;
begin
  if is_admin() then
    return true;
  end if;
  select plan into v_plan from negocios where id = p_negocio_id;
  if v_plan is distinct from 'basico' then
    return true;
  end if;
  select count(*) into v_count from barberia_clientes where negocio_id = p_negocio_id;
  return v_count < 100;
end;
$$;

create or replace function puede_agendar_cita(p_negocio_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_plan text;
  v_count integer;
begin
  if is_admin() then
    return true;
  end if;
  select plan into v_plan from negocios where id = p_negocio_id;
  if v_plan is distinct from 'basico' then
    return true;
  end if;
  -- Igual que citasDelMes en app/app/agenda/page.tsx: canceladas no cuentan.
  select count(*) into v_count
    from barberia_citas
    where negocio_id = p_negocio_id
      and estado <> 'cancelada'
      and fecha >= date_trunc('month', now())::date;
  return v_count < 100;
end;
$$;

drop policy if exists "fonda_pedidos_limite_plan" on fonda_pedidos;
create policy "fonda_pedidos_limite_plan" on fonda_pedidos as restrictive for insert
  with check (puede_crear_pedido(negocio_id));

drop policy if exists "abarrotes_productos_limite_plan" on abarrotes_productos;
create policy "abarrotes_productos_limite_plan" on abarrotes_productos as restrictive for insert
  with check (puede_crear_producto(negocio_id));

drop policy if exists "barberia_clientes_limite_plan" on barberia_clientes;
create policy "barberia_clientes_limite_plan" on barberia_clientes as restrictive for insert
  with check (puede_crear_cliente(negocio_id));

-- barberia_citas también recibe inserts públicos (reserva en /b/[slug],
-- policy "barberia_citas_public_insert") — esta restrictiva aplica igual
-- a esos como a los que crea el dueño/empleado desde la app, sin tocar
-- esa policy ni la de "barberia_citas_owner_write" (solo cubre UPDATE).
drop policy if exists "barberia_citas_limite_plan" on barberia_citas;
create policy "barberia_citas_limite_plan" on barberia_citas as restrictive for insert
  with check (puede_agendar_cita(negocio_id));

notify pgrst, 'reload schema';
