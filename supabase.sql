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
  telefono text default '',
  direccion text,
  is_active boolean not null default true,
  trial_fin date not null default (current_date + interval '7 days'),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  app_slug text not null default 'fuera-libreta'
);

-- El teléfono ya no se pide al crear el negocio (ver "LOGIN POR SMS" más
-- abajo) — nullable, con '' como default, para que un INSERT que no lo
-- mande explícito nunca truene. Si esta tabla ya existía de antes con NOT
-- NULL, esto la alinea con el resto del script sin tronar.
alter table negocios alter column telefono drop not null;
alter table negocios alter column telefono set default '';

-- A qué app (de mis_apps, ver más abajo) pertenece este negocio. Por defecto
-- 'fuera-libreta' porque hoy es la única app real de este proyecto — todo
-- negocio ya existente antes de esta columna también es de esa app.
alter table negocios add column if not exists app_slug text not null default 'fuera-libreta';

-- Número de WhatsApp para recibir citas (Configuración > Perfil, barbería).
-- Separado de `telefono`: un negocio puede querer recibir las citas en un
-- número distinto al de contacto general. NULL hasta que el dueño lo
-- configure — los botones de WhatsApp del link público muestran una alerta
-- en vez de un link roto mientras tanto.
alter table negocios add column if not exists whatsapp text;

create index if not exists negocios_owner_id_idx on negocios(owner_id);
create index if not exists negocios_slug_idx on negocios(slug);
create index if not exists negocios_app_slug_idx on negocios(app_slug);

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

-- Cómo se cobró el corte (se pide al marcar la cita como "listo") — para que
-- Caja pueda sumarlo a Efectivo/Transferencia igual que un movimiento manual.
-- Nullable: citas viejas o que nunca se marcaron como listas no tienen método.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'barberia_citas' and column_name = 'metodo'
  ) then
    alter table barberia_citas add column metodo text check (metodo in ('efectivo', 'transferencia'));
  end if;
end $$;

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

-- Resuelve (o crea) el cliente de una reserva pública por teléfono, sin dar a
-- anon acceso de lectura directo a barberia_clientes (ahí sí viven nombre y
-- teléfono de TODOS los clientes del negocio — una policy de select amplia
-- para poder buscar "¿existe este teléfono?" filtraría ese directorio
-- completo a cualquier visitante de /b/[slug]). security definer: corre con
-- privilegios elevados, pero solo devuelve un uuid, nunca datos de clientes.
create or replace function find_or_create_barberia_cliente(p_negocio_id uuid, p_nombre text, p_telefono text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from negocios n where n.id = p_negocio_id and n.is_active) then
    raise exception 'Negocio no encontrado o inactivo';
  end if;

  -- Esta función es security definer y anon tiene permiso de ejecutarla
  -- directamente (grant execute más abajo), así que valida aunque la API
  -- (app/api/public/citas) ya lo haya hecho — nunca confíes solo en el
  -- frontend/backend de Next para lo que la base de datos puede exponer
  -- por su cuenta.
  if p_nombre is null or length(trim(p_nombre)) < 2 or length(p_nombre) > 50 or p_nombre ~ '[<>]' then
    raise exception 'Nombre inválido';
  end if;
  if p_telefono is null or p_telefono !~ '^[0-9]{7,15}$' then
    raise exception 'Teléfono inválido';
  end if;

  select id into v_id from barberia_clientes where negocio_id = p_negocio_id and telefono = p_telefono limit 1;

  if v_id is null then
    insert into barberia_clientes (negocio_id, nombre, telefono, visitas)
    values (p_negocio_id, p_nombre, p_telefono, 0)
    returning id into v_id;
  else
    -- Mismo teléfono, nombre distinto al guardado (p. ej. se lo cambió): se actualiza.
    update barberia_clientes set nombre = p_nombre where id = v_id and nombre is distinct from p_nombre;
  end if;

  return v_id;
end;
$$;

grant execute on function find_or_create_barberia_cliente(uuid, text, text) to anon, authenticated;

-- Deja que un cliente sin login vea sus propias citas pendientes en
-- /b/[slug]/cliente, buscando solo por su teléfono (mismo modelo de
-- "seguridad" que find_or_create_barberia_cliente: no hay login, el
-- teléfono exacto es la prueba de que es su propio registro). security
-- definer: corre con privilegios elevados pero solo devuelve las citas de
-- ESE teléfono en ESE negocio, nunca el directorio completo de clientes.
create or replace function get_citas_por_telefono(p_negocio_id uuid, p_telefono text)
returns table (cliente_nombre text, servicio_nombre text, precio numeric, fecha date, hora time)
language sql
security definer
set search_path = public
as $$
  select cliente_nombre, servicio_nombre, precio, fecha, hora
  from barberia_citas
  where negocio_id = p_negocio_id
    and cliente_telefono = p_telefono
    and estado = 'pendiente'
  order by fecha asc, hora asc;
$$;

grant execute on function get_citas_por_telefono(uuid, text) to anon, authenticated;

-- Para que el panel del barbero (Agenda) vea una cita nueva de /b/[slug] al
-- instante sin recargar la página: Supabase Realtime necesita que la tabla
-- esté en la publicación supabase_realtime. "add table" sin guarda truena si
-- ya estaba agregada, así que se checa primero.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'barberia_citas'
  ) then
    alter publication supabase_realtime add table barberia_citas;
  end if;
end $$;

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
  fecha date not null default current_date,
  hora time not null default current_time,
  hora_entrega time,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'entregado')),
  total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- Para pedidos creados antes de que existieran estas columnas: filtrar por
-- Hoy/Ayer/Semana (ver /app/inicio, FondaDashboard) no tiene sentido sin
-- fecha, así que a los pedidos viejos se les asume la fecha de su created_at.
alter table fonda_pedidos add column if not exists fecha date not null default current_date;
alter table fonda_pedidos add column if not exists hora_entrega time;
update fonda_pedidos set fecha = created_at::date where fecha = current_date and created_at::date <> current_date;

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
  stock numeric(10, 3) not null default 0,
  minimo integer not null default 5,
  control_caducidad boolean not null default false,
  unidad text not null default 'pieza'
);

create index if not exists abarrotes_productos_negocio_codigo_idx on abarrotes_productos(negocio_id, codigo);

-- Migración: unidad para venta por peso (kg/granel, admite decimales) y
-- stock pasa de integer a numeric para poder guardar 0.250 kg, etc.
alter table abarrotes_productos add column if not exists unidad text not null default 'pieza';
alter table abarrotes_productos alter column stock type numeric(10, 3);

-- Emoji/ícono elegido a mano por producto (se ve en el grid de Nueva Venta);
-- sin valor, el frontend usa un default por categoría.
alter table abarrotes_productos add column if not exists emoji text;

create table if not exists abarrotes_lotes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references abarrotes_productos(id) on delete cascade,
  cantidad integer not null default 0,
  fecha_caducidad date
);

create table if not exists abarrotes_ventas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  total numeric(10, 2) not null default 0,
  fecha timestamptz not null default now()
);

create table if not exists abarrotes_sale_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references abarrotes_ventas(id) on delete cascade,
  producto_id uuid references abarrotes_productos(id) on delete set null,
  producto_nombre text not null,
  cantidad numeric(10, 3) not null default 1,
  precio_unitario numeric(10, 2) not null default 0,
  subtotal numeric(10, 2) not null default 0
);

-- Cantidad admite decimales para ventas por peso (kg/granel).
alter table abarrotes_sale_items alter column cantidad type numeric(10, 3);

-- Migración: abarrotes_ventas pasó de "1 fila = 1 producto" a un ticket con
-- varios renglones en abarrotes_sale_items. Si la tabla ya existía con las
-- columnas viejas (producto_id/producto_nombre/cantidad), primero se migran
-- sus filas a abarrotes_sale_items antes de quitarlas, sin perder ventas.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'abarrotes_ventas' and column_name = 'producto_nombre'
  ) then
    insert into abarrotes_sale_items (venta_id, producto_id, producto_nombre, cantidad, precio_unitario, subtotal)
    select id, producto_id, producto_nombre, cantidad,
           case when cantidad > 0 then total / cantidad else total end,
           total
    from abarrotes_ventas
    where not exists (select 1 from abarrotes_sale_items si where si.venta_id = abarrotes_ventas.id);

    alter table abarrotes_ventas drop column producto_id;
    alter table abarrotes_ventas drop column producto_nombre;
    alter table abarrotes_ventas drop column cantidad;
  end if;
end $$;

-- Para que el panel de Abarrotes (Inicio, Inventario > Ventas) vea una
-- venta nueva cobrada desde OTRO dispositivo/caja de la misma tienda al
-- instante, sin recargar — mismo motivo que barberia_citas más arriba.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'abarrotes_ventas'
  ) then
    alter publication supabase_realtime add table abarrotes_ventas;
  end if;
end $$;

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
  fecha_limite date not null,
  entregado boolean not null default false
);

alter table abarrotes_apartados add column if not exists entregado boolean not null default false;

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
alter table abarrotes_sale_items enable row level security;
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
-- PANEL DE ADMIN (/admin) — profiles, roles y acceso de dios
-- ============================================================================
-- profiles espeja auth.users (que no es accesible desde el cliente) para que
-- el panel pueda listar/buscar/filtrar usuarios, y para poder marcar quién
-- es admin. Se llena sola con un trigger cuando alguien se registra.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  avatar_url text,
  role text not null default 'user' check (role in ('admin', 'user')),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

-- Si ya tenías una tabla profiles de antes, esto agrega lo que falte sin tronar.
alter table profiles add column if not exists role text not null default 'user';
alter table profiles add column if not exists plan text not null default 'free';
alter table profiles add column if not exists is_banned boolean not null default false;
alter table profiles add column if not exists email text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists created_at timestamptz not null default now();

create index if not exists profiles_email_idx on profiles(email);

-- Hub de super admin (/app/admin-hub): registro de cada app/SaaS que vive
-- en este mismo proyecto bajo fueralibreta.com, todas compartiendo esta
-- misma auth de Supabase. negocios.app_slug (ver arriba) amarra cada
-- negocio a una de estas apps. Crear una fila aquí NO genera código — solo
-- la registra para que aparezca en el hub; el módulo real (rutas, tablas
-- propias si las necesita) se construye aparte.
--
-- Sin icono/color: esas dos son puramente cosméticas y viven hardcodeadas
-- en el frontend (ver APP_LOOK en components/admin/admin-hub.tsx), no en la
-- base de datos — una columna de más que el código espera pero la tabla no
-- tiene es exactamente el tipo de bug que ya rompió este hub una vez.
create table if not exists mis_apps (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text unique not null,
  descripcion text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Si esta tabla se creó a mano en el SQL Editor (fuera de este script),
-- PostgREST (la capa que expone la API que usa supabase-js) puede tardar en
-- notar que existe y devolver "relation mis_apps does not exist" incluso ya
-- creada. Esto fuerza el reload inmediato de su cache de esquema.
notify pgrst, 'reload schema';

-- Módulo Rentas (/app/rentas, mis_apps.slug = 'rentas'): propiedades de
-- quien las registra. owner_id existe por si algún día alguien más además
-- del admin usa este módulo; hoy en la práctica solo el admin llega aquí
-- (ver RUTAS_SUPER_ADMIN en components/app-shell/authenticated-shell.tsx).
create table if not exists rentas_propiedades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  precio numeric not null default 0,
  estado text not null default 'disponible',
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table rentas_propiedades enable row level security;

drop policy if exists "rentas_propiedades_owner" on rentas_propiedades;
create policy "rentas_propiedades_owner" on rentas_propiedades for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

notify pgrst, 'reload schema';

-- "1 teléfono = 1 cuenta": único a nivel de nuestra tabla (además de que
-- Supabase Auth ya exige que auth.users.phone sea único cuando el provider
-- de Phone está prendido — ver notas de integración al final del archivo).
-- Partial index en vez de constraint UNIQUE simple para no chocar con las
-- muchas filas que todavía no tienen teléfono verificado (null).
drop index if exists profiles_phone_unique_idx;
create unique index profiles_phone_unique_idx on profiles(phone) where phone is not null;

-- Crea (o actualiza el email/teléfono/avatar de) el profile cada vez que
-- alguien se registra o cambia sus datos. raw_user_meta_data trae
-- avatar_url (o picture, según el proveedor) del login con Google/Apple.
-- Si es tu correo, te deja como admin desde el insert (no toca el role en
-- updates, para no pisar un rol que hayas cambiado a mano desde /admin).
create or replace function handle_new_or_updated_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, phone, avatar_url, role)
  values (
    new.id,
    new.email,
    new.phone,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    case when new.email = 'owenxmaldonado100@gmail.com' then 'admin' else 'user' end
  )
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        avatar_url = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_or_updated_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function handle_new_or_updated_user();

drop trigger if exists on_auth_user_phone_updated on auth.users;
create trigger on_auth_user_phone_updated
  after update of phone on auth.users
  for each row execute function handle_new_or_updated_user();

-- Backfill: crea el profile de quien ya se había registrado antes de correr esto.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- Función helper: ¿el usuario autenticado es admin? security definer para no
-- caer en recursión infinita con las policies de profiles que la usan.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Borrado de usuario desde /admin (DELETE /api/admin/users/[id]): antes esa
-- ruta solo borraba auth.users y confiaba en que el ON DELETE CASCADE de
-- cada tabla con negocio_id limpiara todo solo. En la práctica, si UNA sola
-- tabla le faltaba el CASCADE, o de plano no existe en este proyecto de
-- Supabase (puede haber diferencias entre el esquema real y este script si
-- alguien corrió una versión vieja, o si el negocio es de otra app del hub),
-- auth.admin.deleteUser() tronaba entero con un 500 genérico — bloqueando el
-- borrado de cualquier usuario con 2+ negocios si uno solo tenía el problema.
--
-- Esta función busca EN VIVO (information_schema, no una lista fija en el
-- código) todas las tablas afectadas y borra ahí sus filas para los
-- negocios dados, cada tabla en su propio bloque exception — si una tabla
-- no existe, se ignora y sigue con las demás en vez de tronar todo. Dos
-- pasadas, no una:
--   1) cualquier tabla de public con una FOREIGN KEY que apunte a
--      negocios(id), sin importar cómo se llame la columna. Necesaria
--      porque una tabla vieja/renombrada de una versión anterior del
--      esquema (p. ej. barberia_config, barberia_ventas, barberia_cortes —
--      hoy barberia_caja/barberia_citas cubren eso) puede seguir viva en
--      un proyecto real de Supabase con una FK a negocios por una columna
--      que NO se llama negocio_id; antes esa tabla se colaba entera y el
--      DELETE FROM negocios de más abajo tronaba con
--      "violates foreign key constraint" (el bug real detrás del 500).
--   2) cualquier tabla con columna literal negocio_id, por si alguna
--      guarda ese dato sin tener la FK declarada como constraint.
-- Al final borra las filas de negocios. Se llama desde el Route Handler
-- con la service_role key (que ya salta RLS), así que no necesita ninguna
-- policy nueva.
drop function if exists admin_delete_negocios_data(uuid[]);

create or replace function admin_delete_negocios_data(p_negocio_ids uuid[])
returns void
language plpgsql
security definer
as $$
declare
  tbl record;
begin
  for tbl in
    select distinct
      tc.table_name,
      kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name <> 'negocios'
      and ccu.table_name = 'negocios'
      and ccu.column_name = 'id'
  loop
    begin
      execute format('delete from public.%I where %I = any($1)', tbl.table_name, tbl.column_name) using p_negocio_ids;
    exception when others then
      raise notice 'admin_delete_negocios_data: no se pudo limpiar % por FK (%.%) (%): %',
        tbl.table_name, tbl.table_name, tbl.column_name, sqlstate, sqlerrm;
    end;
  end loop;

  for tbl in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'negocio_id'
      and c.table_name <> 'negocios'
  loop
    begin
      execute format('delete from public.%I where negocio_id = any($1)', tbl.table_name) using p_negocio_ids;
    exception when others then
      raise notice 'admin_delete_negocios_data: no se pudo limpiar % (%): %', tbl.table_name, sqlstate, sqlerrm;
    end;
  end loop;

  delete from negocios where id = any(p_negocio_ids);
end;
$$;

grant execute on function admin_delete_negocios_data(uuid[]) to service_role;

alter table profiles enable row level security;

drop policy if exists "profiles_self_select" on profiles;
create policy "profiles_self_select" on profiles for select
  using (id = auth.uid());

drop policy if exists "profiles_admin_all" on profiles;
create policy "profiles_admin_all" on profiles for all
  using (is_admin()) with check (is_admin());

-- Da al admin control total (lectura y escritura) sobre todas las tablas del
-- negocio, además de las policies de dueño que ya existían. "for all" cubre
-- select/insert/update/delete, así se puede administrar todo desde /admin
-- sin tocar el Table Editor de Supabase.
drop policy if exists "negocios_admin_all" on negocios;
create policy "negocios_admin_all" on negocios for all using (is_admin()) with check (is_admin());

-- mis_apps es exclusivamente del super admin: nadie más puede ni leerla.
alter table mis_apps enable row level security;
drop policy if exists "mis_apps_admin_all" on mis_apps;
create policy "mis_apps_admin_all" on mis_apps for all using (is_admin()) with check (is_admin());

-- Seed: la app que ya existe (esta misma). Segura de volver a correr.
insert into mis_apps (nombre, slug, descripcion, activo)
values ('Fuera Libreta', 'fuera-libreta', 'Punto de venta para negocios locales', true)
on conflict (slug) do nothing;

drop policy if exists "rentas_propiedades_admin_all" on rentas_propiedades;
create policy "rentas_propiedades_admin_all" on rentas_propiedades for all using (is_admin()) with check (is_admin());

drop policy if exists "barberia_servicios_admin_all" on barberia_servicios;
create policy "barberia_servicios_admin_all" on barberia_servicios for all using (is_admin()) with check (is_admin());
drop policy if exists "barberia_horario_admin_all" on barberia_horario;
create policy "barberia_horario_admin_all" on barberia_horario for all using (is_admin()) with check (is_admin());
drop policy if exists "barberia_excepciones_admin_all" on barberia_excepciones;
create policy "barberia_excepciones_admin_all" on barberia_excepciones for all using (is_admin()) with check (is_admin());
drop policy if exists "barberia_clientes_admin_all" on barberia_clientes;
create policy "barberia_clientes_admin_all" on barberia_clientes for all using (is_admin()) with check (is_admin());
drop policy if exists "barberia_citas_admin_all" on barberia_citas;
create policy "barberia_citas_admin_all" on barberia_citas for all using (is_admin()) with check (is_admin());
drop policy if exists "barberia_caja_admin_all" on barberia_caja;
create policy "barberia_caja_admin_all" on barberia_caja for all using (is_admin()) with check (is_admin());
drop policy if exists "barberia_productos_admin_all" on barberia_productos;
create policy "barberia_productos_admin_all" on barberia_productos for all using (is_admin()) with check (is_admin());

drop policy if exists "fonda_platillos_admin_all" on fonda_platillos;
create policy "fonda_platillos_admin_all" on fonda_platillos for all using (is_admin()) with check (is_admin());
drop policy if exists "fonda_pedidos_admin_all" on fonda_pedidos;
create policy "fonda_pedidos_admin_all" on fonda_pedidos for all using (is_admin()) with check (is_admin());
drop policy if exists "fonda_pedido_items_admin_all" on fonda_pedido_items;
create policy "fonda_pedido_items_admin_all" on fonda_pedido_items for all using (is_admin()) with check (is_admin());
drop policy if exists "fonda_gastos_admin_all" on fonda_gastos;
create policy "fonda_gastos_admin_all" on fonda_gastos for all using (is_admin()) with check (is_admin());

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

drop policy if exists "contactos_admin_all" on contactos;
create policy "contactos_admin_all" on contactos for all using (is_admin()) with check (is_admin());

-- Seed: negocio de demostración fijo para hacer demos en vivo con clientes
-- por /b/demo-barber, sin depender de haber iniciado sesión ni de la demo
-- local (que solo vive en localStorage hasta activarse desde /onboarding).
-- is_active=true + owner_id null: las policies públicas ya lo dejan ver sin
-- login. Seguro de volver a correr (on conflict / not exists en cada insert).
insert into negocios (slug, nombre, tipo, dueno, telefono, is_active, demo)
values ('demo-barber', 'Barbería Demo', 'barberia', 'Fuera Libreta', '3312345678', true, true)
on conflict (slug) do nothing;

insert into barberia_servicios (negocio_id, nombre, precio, duracion_min)
select n.id, s.nombre, s.precio, s.duracion_min
from negocios n,
  (values
    ('Corte clásico', 120, 30),
    ('Corte + barba', 180, 45),
    ('Solo barba', 90, 20),
    ('Corte niño', 100, 25)
  ) as s(nombre, precio, duracion_min)
where n.slug = 'demo-barber'
  and not exists (select 1 from barberia_servicios bs where bs.negocio_id = n.id);

insert into barberia_horario (negocio_id, dia, abierto, inicio, fin)
select n.id, h.dia, h.abierto, h.inicio, h.fin
from negocios n,
  (values
    ('Lun', true, '09:00'::time, '19:00'::time),
    ('Mar', true, '10:00'::time, '18:00'::time),
    ('Mié', true, '09:00'::time, '19:00'::time),
    ('Jue', true, '09:00'::time, '19:00'::time),
    ('Vie', true, '09:00'::time, '20:00'::time),
    ('Sáb', true, '09:00'::time, '17:00'::time),
    ('Dom', false, '10:00'::time, '14:00'::time)
  ) as h(dia, abierto, inicio, fin)
where n.slug = 'demo-barber'
  and not exists (select 1 from barberia_horario bh where bh.negocio_id = n.id);

-- Seed: te hace admin a ti. Seguro de volver a correr; si todavía no te has
-- registrado con Google, no hace nada (corre este UPDATE de nuevo después
-- de tu primer login).
update profiles set role = 'admin' where email = 'owenxmaldonado100@gmail.com';

-- Si owen.top@gmail.com es una cuenta REAL distinta que también debe ser
-- super admin (y no un typo de la de arriba), corre esto también después de
-- que esa cuenta inicie sesión al menos una vez:
-- update profiles set role = 'admin' where email = 'owen.top@gmail.com';

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
-- 4. /admin ya está conectado de verdad: lee/escribe profiles y negocios con
--    tu propia sesión de admin (las policies "*_admin_all" de arriba se
--    encargan de darte acceso a todo). Solo dos acciones necesitan la
--    service_role key en el servidor porque tocan auth.users, que no es
--    accesible desde el cliente aunque seas admin: eliminar una cuenta por
--    completo (auth.admin.deleteUser) y "ver como este usuario"
--    (auth.admin.generateLink). Pon SUPABASE_SERVICE_ROLE_KEY (Settings →
--    API → service_role, NUNCA con prefijo NEXT_PUBLIC_) en tus variables de
--    entorno del servidor para que esas dos acciones funcionen.
-- 5. Después de tu primer login con Google, vuelve a correr el UPDATE de
--    arriba (o cualquiera con permisos de Supabase puede correrlo por ti)
--    para confirmar que quedaste como admin.
-- 6. LOGIN POR SMS: eliminado del UI por completo (/login, /onboarding). El
--    provider de SMS nunca se configuró en el dashboard de Supabase, así
--    que ese flujo nunca funcionó en producción y bloqueaba altas reales.
--    /login ofrece únicamente Google; /onboarding crea el negocio sin
--    pedir número (queda opcional, editable después en Configuración >
--    Perfil). El índice único de profiles.phone de arriba no estorba si
--    se reactiva más adelante — solo hace falta configurar el provider de
--    Phone en Authentication → Providers y reintroducir el flujo en el UI.
--    APPLE: sigue sin implementarse en el UI; si se agrega, activarlo en
--    Authentication → Providers → Apple con credenciales de Apple
--    Developer (Services ID, Team ID, Key ID, private key .p8).

-- ============================================================================
-- HARDENING — validación a nivel de base de datos (defensa en profundidad)
-- ============================================================================
-- Las rutas de Next.js (app/api/public/*) y el frontend ya validan con zod
-- (teléfono solo dígitos, nombre ≤ 50 caracteres sin < >), pero cualquiera
-- puede pegarle directo a la API REST de Supabase con la anon key sin pasar
-- por Next.js. Estos CHECK repiten la misma regla adentro de Postgres, que
-- es la última línea de defensa real. NOT VALID: se aplican a partir de
-- ahora sin tronar si ya existiera una fila vieja que no cumpliera (no hay
-- forma de saber desde aquí si este script corre sobre una base nueva o con
-- datos reales ya cargados).
--
-- Se aplican solo donde el dato lo escribe (directa o indirectamente) un
-- visitante sin login: reservas públicas (barberia_citas, barberia_clientes
-- vía find_or_create_barberia_cliente) y el formulario de contacto de la
-- landing (contactos).
do $$
begin
  alter table barberia_citas drop constraint if exists barberia_citas_cliente_nombre_check;
  alter table barberia_citas add constraint barberia_citas_cliente_nombre_check
    check (char_length(cliente_nombre) <= 50 and cliente_nombre !~ '[<>]') not valid;

  alter table barberia_citas drop constraint if exists barberia_citas_cliente_telefono_check;
  alter table barberia_citas add constraint barberia_citas_cliente_telefono_check
    check (cliente_telefono ~ '^[0-9]{0,15}$') not valid;

  alter table barberia_clientes drop constraint if exists barberia_clientes_nombre_check;
  alter table barberia_clientes add constraint barberia_clientes_nombre_check
    check (char_length(nombre) <= 50 and nombre !~ '[<>]') not valid;

  alter table barberia_clientes drop constraint if exists barberia_clientes_telefono_check;
  alter table barberia_clientes add constraint barberia_clientes_telefono_check
    check (telefono ~ '^[0-9]{0,15}$') not valid;

  alter table contactos drop constraint if exists contactos_nombre_check;
  alter table contactos add constraint contactos_nombre_check
    check (char_length(nombre) <= 50 and nombre !~ '[<>]') not valid;

  alter table contactos drop constraint if exists contactos_telefono_check;
  alter table contactos add constraint contactos_telefono_check
    check (telefono ~ '^[0-9]{0,15}$') not valid;

  alter table contactos drop constraint if exists contactos_mensaje_check;
  alter table contactos add constraint contactos_mensaje_check
    check (mensaje is null or (char_length(mensaje) <= 1000 and mensaje !~ '[<>]')) not valid;
end $$;

-- ============================================================================
-- LEADS (PR #3) — captura de la cajita de contacto de la landing, gestionada
-- desde el panel super-admin (tab "Leads"). Reemplaza el destino de escritura
-- de /api/public/contacto (antes insertaba en `contactos`); esa tabla se deja
-- intacta para no perder el historial ya capturado.
-- ============================================================================

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) <= 50 and nombre !~ '[<>]'),
  whatsapp text not null check (whatsapp ~ '^[0-9]{7,15}$'),
  tipo_negocio text not null check (tipo_negocio in ('fonda', 'abarrotes', 'barberia', 'otro')),
  mensaje text check (mensaje is null or (char_length(mensaje) <= 1000 and mensaje !~ '[<>]')),
  origen text not null default 'landing',
  estado text not null default 'nuevo' check (estado in ('nuevo', 'contactado', 'convertido')),
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on leads(created_at desc);
create index if not exists leads_tipo_negocio_idx on leads(tipo_negocio);

alter table leads enable row level security;

-- Público (landing sin login): solo puede insertar su propio lead. El rate
-- limit real vive en la app (checkRateLimit en /api/public/contacto), no en
-- Postgres — esta policy únicamente evita que anon pueda leer, editar o
-- borrar leads ajenos.
drop policy if exists "leads_public_insert" on leads;
create policy "leads_public_insert" on leads for insert
  to anon
  with check (estado = 'nuevo' and origen = 'landing');

-- Solo el super-admin (is_admin(), que hoy es exclusivamente
-- owenxmaldonado100@gmail.com vía profiles.role='admin') puede ver, crear,
-- editar o borrar leads. Mismo patrón que el resto de las tablas *_admin_all.
drop policy if exists "leads_admin_all" on leads;
create policy "leads_admin_all" on leads for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- Red de seguridad final: si corriste este script completo (tablas nuevas,
-- columnas nuevas, policies nuevas), fuerza a PostgREST a recargar su cache
-- de esquema ya. Sin esto, a veces sigue devolviendo "does not exist" para
-- algo que ya existe hasta que su cache se refresca solo (normalmente
-- segundos, pero no vale la pena esperar).
-- ============================================================================
notify pgrst, 'reload schema';
