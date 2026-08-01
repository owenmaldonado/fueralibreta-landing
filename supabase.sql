-- ============================================================================
-- FUERA LIBRETA — esquema de Supabase
-- ============================================================================
-- Pega este archivo completo en Supabase → SQL Editor → New query → Run.
-- Es seguro volver a correrlo (usa IF NOT EXISTS / OR REPLACE donde aplica).
--
-- Reemplaza al modelo mock de lib/mock.ts + lib/session.ts (localStorage)
-- una vez que quieras que /app, /demo, /onboarding, /admin y /reserva/[slug]
-- lean y escriban datos reales en vez de datos de prueba en el navegador.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- NEGOCIOS
-- ============================================================================

do $$ begin
  create type business_type as enum ('barberia', 'fonda', 'abarrotes');
exception when duplicate_object then null;
end $$;

create table if not exists negocios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  slug text unique not null,
  nombre text not null,
  tipo business_type not null,
  dueno text not null,
  telefono text not null,
  direccion text,
  is_active boolean not null default true,
  trial_fin date not null default (current_date + interval '7 days'),
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists negocios_owner_id_idx on negocios(owner_id);
create index if not exists negocios_slug_idx on negocios(slug);

-- Función helper: ¿el usuario autenticado es dueño de este negocio?
create or replace function is_negocio_owner(p_negocio_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from negocios n where n.id = p_negocio_id and n.owner_id = auth.uid()
  );
$$;

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

-- No hay policy de delete: se pausa un negocio con is_active = false, no se borra.
-- El panel /admin (Pausar/Activar todos los negocios) debe correr con la
-- service_role key desde el servidor, que salta RLS automáticamente.

-- ============================================================================
-- BARBERÍA
-- ============================================================================

create table if not exists barberia_servicios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre text not null,
  precio numeric(10, 2) not null,
  duracion_min integer not null default 30
);

create table if not exists barberia_horario (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  dia text not null check (dia in ('Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom')),
  abierto boolean not null default true,
  inicio time not null default '09:00',
  fin time not null default '19:00',
  unique (negocio_id, dia)
);

create table if not exists barberia_excepciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  fecha date not null,
  etiqueta text not null,
  cerrado boolean not null default true,
  hora_especial_fin time
);

create table if not exists barberia_clientes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre text not null,
  telefono text not null default '',
  ultima_visita date,
  visitas integer not null default 0,
  notas text,
  cumpleanos text -- formato 'MM-DD'
);

create table if not exists barberia_citas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  cliente_id uuid references barberia_clientes(id) on delete set null,
  cliente_nombre text not null,
  cliente_telefono text not null default '',
  servicio_id uuid references barberia_servicios(id) on delete set null,
  servicio_nombre text not null,
  precio numeric(10, 2) not null default 0,
  fecha date not null,
  hora time not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'listo', 'cancelada')),
  created_at timestamptz not null default now()
);

create index if not exists barberia_citas_negocio_fecha_idx on barberia_citas(negocio_id, fecha);

create table if not exists barberia_caja (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  tipo text not null check (tipo in ('venta', 'propina', 'gasto')),
  concepto text not null,
  monto numeric(10, 2) not null,
  metodo text not null check (metodo in ('efectivo', 'transferencia')),
  fecha timestamptz not null default now()
);

create table if not exists barberia_productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre text not null,
  stock integer not null default 0,
  minimo integer not null default 3
);

alter table barberia_servicios enable row level security;
alter table barberia_horario enable row level security;
alter table barberia_excepciones enable row level security;
alter table barberia_clientes enable row level security;
alter table barberia_citas enable row level security;
alter table barberia_caja enable row level security;
alter table barberia_productos enable row level security;

-- Dueño: control total sobre todo lo de su negocio.
drop policy if exists "barberia_servicios_owner" on barberia_servicios;
create policy "barberia_servicios_owner" on barberia_servicios for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "barberia_horario_owner" on barberia_horario;
create policy "barberia_horario_owner" on barberia_horario for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "barberia_excepciones_owner" on barberia_excepciones;
create policy "barberia_excepciones_owner" on barberia_excepciones for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "barberia_clientes_owner" on barberia_clientes;
create policy "barberia_clientes_owner" on barberia_clientes for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "barberia_caja_owner" on barberia_caja;
create policy "barberia_caja_owner" on barberia_caja for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "barberia_productos_owner" on barberia_productos;
create policy "barberia_productos_owner" on barberia_productos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

-- Público (clientes en /reserva/[slug]): puede ver servicios/horario/excepciones
-- de negocios activos, y agendar (insertar) su propia cita.
drop policy if exists "barberia_servicios_public_select" on barberia_servicios;
create policy "barberia_servicios_public_select" on barberia_servicios for select
  using (exists (select 1 from negocios n where n.id = negocio_id and n.is_active));

drop policy if exists "barberia_horario_public_select" on barberia_horario;
create policy "barberia_horario_public_select" on barberia_horario for select
  using (exists (select 1 from negocios n where n.id = negocio_id and n.is_active));

drop policy if exists "barberia_excepciones_public_select" on barberia_excepciones;
create policy "barberia_excepciones_public_select" on barberia_excepciones for select
  using (exists (select 1 from negocios n where n.id = negocio_id and n.is_active));

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

-- Vista pública sin datos personales, solo para calcular huecos disponibles
-- en /reserva/[slug] sin exponer nombre/teléfono de otros clientes.
create or replace view barberia_citas_publicas as
  select negocio_id, fecha, hora, estado
  from barberia_citas
  where estado <> 'cancelada';

grant select on barberia_citas_publicas to anon, authenticated;

-- ============================================================================
-- FONDA
-- ============================================================================

create table if not exists fonda_platillos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre text not null,
  precio numeric(10, 2) not null,
  categoria text not null default 'Platillo fuerte',
  activo_hoy boolean not null default true
);

create table if not exists fonda_pedidos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  cliente_nombre text not null,
  cliente_telefono text,
  hora time not null default current_time,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'entregado')),
  total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists fonda_pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references fonda_pedidos(id) on delete cascade,
  platillo_id uuid references fonda_platillos(id) on delete set null,
  platillo_nombre text not null,
  cantidad integer not null default 1,
  nota text
);

create table if not exists fonda_gastos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  categoria text not null,
  monto numeric(10, 2) not null,
  fecha date not null default current_date,
  recordatorio boolean not null default false
);

alter table fonda_platillos enable row level security;
alter table fonda_pedidos enable row level security;
alter table fonda_pedido_items enable row level security;
alter table fonda_gastos enable row level security;

drop policy if exists "fonda_platillos_owner" on fonda_platillos;
create policy "fonda_platillos_owner" on fonda_platillos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "fonda_pedidos_owner" on fonda_pedidos;
create policy "fonda_pedidos_owner" on fonda_pedidos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

drop policy if exists "fonda_pedido_items_owner" on fonda_pedido_items;
create policy "fonda_pedido_items_owner" on fonda_pedido_items for all
  using (exists (select 1 from fonda_pedidos p where p.id = pedido_id and is_negocio_owner(p.negocio_id)))
  with check (exists (select 1 from fonda_pedidos p where p.id = pedido_id and is_negocio_owner(p.negocio_id)));

drop policy if exists "fonda_gastos_owner" on fonda_gastos;
create policy "fonda_gastos_owner" on fonda_gastos for all
  using (is_negocio_owner(negocio_id)) with check (is_negocio_owner(negocio_id));

-- ============================================================================
-- ABARROTES
-- ============================================================================

create table if not exists abarrotes_productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre text not null,
  codigo text not null default '',
  categoria text not null default 'General',
  costo numeric(10, 2) not null default 0,
  precio numeric(10, 2) not null,
  stock integer not null default 0,
  minimo integer not null default 5,
  control_caducidad boolean not null default false
);

create index if not exists abarrotes_productos_negocio_codigo_idx on abarrotes_productos(negocio_id, codigo);

create table if not exists abarrotes_lotes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references abarrotes_productos(id) on delete cascade,
  cantidad integer not null default 0,
  fecha_caducidad date
);

create table if not exists abarrotes_ventas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  producto_id uuid references abarrotes_productos(id) on delete set null,
  producto_nombre text not null,
  cantidad integer not null default 1,
  total numeric(10, 2) not null,
  fecha timestamptz not null default now()
);

create table if not exists abarrotes_fiados (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  cliente_nombre text not null,
  telefono text not null default '',
  saldo numeric(10, 2) not null default 0
);

create table if not exists abarrotes_fiado_movimientos (
  id uuid primary key default gen_random_uuid(),
  fiado_id uuid not null references abarrotes_fiados(id) on delete cascade,
  fecha date not null default current_date,
  monto numeric(10, 2) not null,
  tipo text not null check (tipo in ('cargo', 'abono'))
);

create table if not exists abarrotes_apartados (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  cliente_nombre text not null,
  telefono text not null default '',
  producto text not null,
  total numeric(10, 2) not null,
  abonado numeric(10, 2) not null default 0,
  fecha_limite date not null
);

create table if not exists abarrotes_gastos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  categoria text not null,
  monto numeric(10, 2) not null,
  fecha date not null default current_date,
  recordatorio boolean not null default false
);

alter table abarrotes_productos enable row level security;
alter table abarrotes_lotes enable row level security;
alter table abarrotes_ventas enable row level security;
alter table abarrotes_fiados enable row level security;
alter table abarrotes_fiado_movimientos enable row level security;
alter table abarrotes_apartados enable row level security;
alter table abarrotes_gastos enable row level security;

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

-- ============================================================================
-- CONTACTOS (formulario de la landing, ver README.md)
-- ============================================================================

create table if not exists contactos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  negocio text not null,
  mensaje text,
  created_at timestamptz not null default now()
);

alter table contactos enable row level security;

drop policy if exists "contactos_public_insert" on contactos;
create policy "contactos_public_insert" on contactos for insert
  to anon
  with check (true);

-- No hay policy de select/update/delete para anon: solo se lee desde el
-- Table Editor de Supabase (con tu cuenta) o con la service_role key.

-- ============================================================================
-- Notas de integración
-- ============================================================================
-- 1. /login usa supabase.auth.signInWithOAuth({ provider: 'google' }).
-- 2. /app, /onboarding y /reserva/[slug] ya leen y escriben estas tablas vía
--    lib/data.ts (fetchTenantData, persistTenant, syncTenantDiff) en vez de
--    localStorage — ver lib/session.ts (useSession) y lib/demoPreview.ts.
-- 3. /demo/[tipo] sigue generando la demo solo en el navegador (localStorage,
--    clave fl_demo_preview) hasta que el usuario inicia sesión y la activa
--    desde /onboarding; ahí recién se inserta en Supabase con persistTenant().
--    Es la única parte del flujo que no toca la base de datos todavía, a
--    propósito: antes de loguearse no hay auth.uid() al que asociar el
--    negocio, y así se puede seguir probando la demo sin cuenta.
-- 4. El panel /admin sigue usando datos de ejemplo en memoria (sampleAdminBusinesses
--    en lib/mock.ts), no está conectado a Supabase. Para conectarlo de verdad
--    necesita la service_role key desde el servidor (nunca en el cliente) para
--    poder pausar/activar cualquier negocio sin las restricciones de RLS.
