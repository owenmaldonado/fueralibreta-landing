-- ============================================================================
-- APP PERSONAL "MI DÍA" (/app/mi-dia) — esquema completo y AISLADO.
--
-- Vive en el mismo proyecto de Supabase que FueraLibreta, pero no comparte
-- ni una sola tabla, columna, función ni policy con él. Todo lo de esta app
-- lleva el prefijo `personal_`, a propósito:
--
--   1. El plan original nombraba las tablas `dias`, `habitos`, `agenda_eventos`,
--      `logros`... En una base compartida esos nombres son minas: el día que
--      FueraLibreta necesite una tabla `agenda_eventos` (ya tiene pantalla
--      "Agenda") o `logros`, chocan. Con el prefijo eso nunca puede pasar.
--   2. Cuando esta app se mude a su propio proyecto de Supabase, se lleva
--      exactamente lo que hace `\dt personal_*` y nada más. La mudanza es un
--      dump filtrado por prefijo, no una arqueología.
--
-- AISLAMIENTO: este archivo solo hace CREATE de objetos nuevos. No hay un
-- solo ALTER, DROP ni CREATE OR REPLACE sobre nada que ya exista. Correrlo
-- dos veces es inofensivo (todo es `if not exists` / `drop policy if exists`
-- sobre policies propias).
--
-- RLS: cada tabla se filtra por `owner_id = auth.uid()`, sin excepción —
-- esta es la información más personal que va a haber en la base. `owner_id`
-- tiene `default auth.uid()`, así que ningún insert desde el cliente puede
-- "olvidarlo" y quedar huérfano (y si alguien lo pusiera a mano apuntando a
-- otro usuario, el `with check` lo rechaza).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Utilidad: actualizado_en automático. Se llama personal_touch() (no touch()
-- a secas) por la misma razón que las tablas van prefijadas — es una función
-- de ESTA app y no debe poder pisar ninguna de FueraLibreta.
-- ----------------------------------------------------------------------------
-- `set search_path` fijo: sin él, una función sin esquema calificado puede
-- resolverse contra un esquema que alguien más controle (el lint
-- function_search_path_mutable de Supabase). Aquí solo se llama now(), pero la
-- regla se cumple igual — no vale la pena tener una excepción que explicar.
create or replace function personal_touch()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. EL DÍA — una fila por fecha. Es la "hoja diaria" del planner.
-- ============================================================================
create table if not exists personal_dias (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,

  clima text,                                   -- 'soleado' | 'nublado' | 'lluvia' | 'frio' | 'calor'
  animo smallint check (animo between 1 and 5),
  energia smallint check (energia between 1 and 5),
  horas_sueno numeric(3, 1) check (horas_sueno >= 0 and horas_sueno <= 24),
  vasos_agua smallint not null default 0 check (vasos_agua >= 0),
  peso_kg numeric(5, 2),

  -- Comidas: texto libre a propósito. Contar calorías es otra app; aquí lo
  -- único que importa es poder releer "qué comí el día que amanecí fatal".
  desayuno text,
  comida text,
  cena text,
  snacks text,

  foco_del_dia text,
  gratitud text,
  nota_destacada text,

  -- Lo marca el "Cierre del día". Sirve para distinguir un día vacío porque
  -- no pasó nada de un día vacío porque no lo registraste — sin eso, las
  -- estadísticas de constancia mienten.
  cerrado boolean not null default false,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  unique (owner_id, fecha)
);

create index if not exists personal_dias_owner_fecha_idx on personal_dias (owner_id, fecha desc);

drop trigger if exists personal_dias_touch on personal_dias;
create trigger personal_dias_touch before update on personal_dias
  for each row execute function personal_touch();

-- ============================================================================
-- 2. HÁBITOS — el catálogo, y un registro por hábito por día.
-- ============================================================================
create table if not exists personal_habitos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  emoji text,
  categoria text,                                -- bienestar | productividad | gym | dinero | mente
  dificultad text not null default 'media' check (dificultad in ('facil', 'media', 'dificil')),

  -- Días de la semana en que el hábito APLICA (0=domingo … 6=sábado).
  -- NULL = todos los días. Sin esto, "gym lunes/miércoles/viernes" aparecía
  -- como incumplido los otros cuatro días y el % del mes salía siempre rojo
  -- aunque lo estuvieras cumpliendo perfecto. Un hábito no puede fallar un
  -- día en el que ni siquiera tocaba.
  dias_semana smallint[],

  -- Meta opcional de días por semana (ej. 4). Solo informativa: alimenta la
  -- barra "4/4 esta semana" del tracker.
  meta_semanal smallint check (meta_semanal between 1 and 7),

  activo boolean not null default true,
  orden smallint not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists personal_habitos_owner_idx on personal_habitos (owner_id, activo, orden);

drop trigger if exists personal_habitos_touch on personal_habitos;
create trigger personal_habitos_touch before update on personal_habitos
  for each row execute function personal_touch();

create table if not exists personal_habito_registro (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habito_id uuid not null references personal_habitos(id) on delete cascade,
  fecha date not null,
  cumplido boolean not null,

  -- El corazón del sistema de 3 colores: no cumplido CON motivo es naranja
  -- (excepción justificada, no rompe racha); no cumplido SIN motivo es rojo.
  motivo text,

  -- Se congela al guardar, no se recalcula: si mañana subes los puntos de un
  -- hábito, tu historial no debe reescribirse solo. Los puntos ganados ya se
  -- ganaron con las reglas de ese día.
  puntos smallint not null default 0,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  unique (owner_id, habito_id, fecha)
);

create index if not exists personal_habito_registro_fecha_idx on personal_habito_registro (owner_id, fecha desc);
create index if not exists personal_habito_registro_habito_idx on personal_habito_registro (owner_id, habito_id, fecha desc);

drop trigger if exists personal_habito_registro_touch on personal_habito_registro;
create trigger personal_habito_registro_touch before update on personal_habito_registro
  for each row execute function personal_touch();

-- ============================================================================
-- 3. AGENDA — bloques del día.
-- ============================================================================
create table if not exists personal_eventos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,
  hora_inicio time,
  hora_fin time,
  titulo text not null,
  lugar text,
  notas text,
  color text,                                    -- clave de PALETA_EVENTO en el front, no un hex suelto
  hecho boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists personal_eventos_owner_fecha_idx on personal_eventos (owner_id, fecha, hora_inicio);

drop trigger if exists personal_eventos_touch on personal_eventos;
create trigger personal_eventos_touch before update on personal_eventos
  for each row execute function personal_touch();

-- ============================================================================
-- 4. DINERO — gastos E ingresos. El plan original solo tenía gastos; con una
--    sola columna `tipo` la misma tabla da saldo del mes, no nada más "cuánto
--    quemé", que es la mitad de la información y la menos accionable.
-- ============================================================================
create table if not exists personal_movimientos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,
  tipo text not null default 'gasto' check (tipo in ('gasto', 'ingreso')),
  monto numeric(12, 2) not null check (monto >= 0),
  categoria text not null,
  metodo text,                                   -- efectivo | tarjeta | transferencia
  nota text,
  creado_en timestamptz not null default now()
);

create index if not exists personal_movimientos_owner_fecha_idx on personal_movimientos (owner_id, fecha desc);

-- ============================================================================
-- 5. GYM — rutinas (plantillas) -> sesiones -> ejercicios -> series.
--
--    Las plantillas no estaban en el plan y son lo que hace la diferencia
--    entre registrar el gym y no registrarlo: sin ellas, cada sesión empieza
--    tecleando de cero los 6 ejercicios de "torso". Con ellas, entrar al gym
--    es un toque a "Torso A" y ya solo capturas peso y reps.
-- ============================================================================
create table if not exists personal_gym_rutinas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,                          -- "Torso A", "Pierna", "Empuje"
  notas text,
  activo boolean not null default true,
  orden smallint not null default 0,
  creado_en timestamptz not null default now()
);

create index if not exists personal_gym_rutinas_owner_idx on personal_gym_rutinas (owner_id, activo, orden);

create table if not exists personal_gym_rutina_ejercicios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rutina_id uuid not null references personal_gym_rutinas(id) on delete cascade,
  nombre text not null,
  series_objetivo smallint not null default 3,
  reps_objetivo smallint not null default 10,
  orden smallint not null default 0
);

create index if not exists personal_gym_rutina_ejercicios_idx on personal_gym_rutina_ejercicios (owner_id, rutina_id, orden);

create table if not exists personal_gym_sesiones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,
  -- Se guarda el NOMBRE, no solo la referencia a la rutina: si algún día
  -- borras o renombras "Torso A", el historial debe seguir diciendo qué
  -- entrenaste ese día. rutina_id queda como liga viva (set null al borrar).
  nombre text not null,
  rutina_id uuid references personal_gym_rutinas(id) on delete set null,
  duracion_min smallint check (duracion_min >= 0),
  sensacion smallint check (sensacion between 1 and 5),
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists personal_gym_sesiones_owner_fecha_idx on personal_gym_sesiones (owner_id, fecha desc);

drop trigger if exists personal_gym_sesiones_touch on personal_gym_sesiones;
create trigger personal_gym_sesiones_touch before update on personal_gym_sesiones
  for each row execute function personal_touch();

create table if not exists personal_gym_ejercicios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sesion_id uuid not null references personal_gym_sesiones(id) on delete cascade,
  nombre text not null,
  orden smallint not null default 0,
  notas text
);

create index if not exists personal_gym_ejercicios_sesion_idx on personal_gym_ejercicios (owner_id, sesion_id, orden);
-- Para la gráfica de progresión ("press banca a través del tiempo"), que
-- busca por nombre de ejercicio a lo largo de todas las sesiones.
create index if not exists personal_gym_ejercicios_nombre_idx on personal_gym_ejercicios (owner_id, nombre);

create table if not exists personal_gym_series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ejercicio_id uuid not null references personal_gym_ejercicios(id) on delete cascade,
  numero smallint not null default 1,
  peso_kg numeric(6, 2) check (peso_kg >= 0),
  repeticiones smallint check (repeticiones >= 0),
  rpe smallint check (rpe between 1 and 10),     -- qué tan al límite acabó la serie
  creado_en timestamptz not null default now()
);

create index if not exists personal_gym_series_ejercicio_idx on personal_gym_series (owner_id, ejercicio_id, numero);

-- ============================================================================
-- 6. LOGROS — solo los DESBLOQUEADOS.
--
--    El plan tenía una tabla `logros` con el catálogo y una columna
--    `condicion text` ("7 días seguidos de agua"). Ese texto no lo puede
--    evaluar nadie: la condición real vive en código de todos modos, así que
--    la tabla de catálogo sería una copia desincronizada de la verdad. Aquí
--    el catálogo vive en lib/personal/logros.ts (versionado con el código) y
--    la base solo guarda qué se desbloqueó y cuándo, que es el único dato
--    que el código no puede recalcular.
-- ============================================================================
create table if not exists personal_logros (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clave text not null,                           -- coincide con LOGROS[].clave en el front
  fecha_desbloqueo date not null default current_date,
  creado_en timestamptz not null default now(),
  unique (owner_id, clave)
);

-- ============================================================================
-- 7. OBJETIVOS DEL AÑO — las 7 categorías "estrella polar" + palabra del año.
-- ============================================================================
create table if not exists personal_objetivos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anio int not null,
  categoria text not null,                       -- cuerpo | mente | dinero | oficio | hogar | gente | alegria
  texto text,
  logrado boolean not null default false,
  actualizado_en timestamptz not null default now(),
  unique (owner_id, anio, categoria)
);

drop trigger if exists personal_objetivos_touch on personal_objetivos;
create trigger personal_objetivos_touch before update on personal_objetivos
  for each row execute function personal_touch();

create table if not exists personal_anio (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anio int not null,
  palabra text,
  intencion text,
  actualizado_en timestamptz not null default now(),
  unique (owner_id, anio)
);

drop trigger if exists personal_anio_touch on personal_anio;
create trigger personal_anio_touch before update on personal_anio
  for each row execute function personal_touch();

-- ============================================================================
-- 8. NOTAS — libres, sin estructura.
-- ============================================================================
create table if not exists personal_notas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text,
  cuerpo text,
  fijada boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists personal_notas_owner_idx on personal_notas (owner_id, fijada desc, actualizado_en desc);

drop trigger if exists personal_notas_touch on personal_notas;
create trigger personal_notas_touch before update on personal_notas
  for each row execute function personal_touch();

-- ============================================================================
-- RLS — misma política para las 14 tablas, sin excepciones ni atajos.
-- ============================================================================
do $$
declare
  t text;
  tablas text[] := array[
    'personal_dias',
    'personal_habitos',
    'personal_habito_registro',
    'personal_eventos',
    'personal_movimientos',
    'personal_gym_rutinas',
    'personal_gym_rutina_ejercicios',
    'personal_gym_sesiones',
    'personal_gym_ejercicios',
    'personal_gym_series',
    'personal_logros',
    'personal_objetivos',
    'personal_anio',
    'personal_notas'
  ];
begin
  foreach t in array tablas loop
    execute format('alter table %I enable row level security', t);
    -- force: ni siquiera el dueño de la tabla (postgres) salta RLS por accidente.
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format(
      'create policy %I on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_owner', t
    );
    -- anon no tiene NINGUNA policy en estas tablas: sin policy, RLS niega
    -- todo. Un visitante sin sesión no puede leer ni una fila.
  end loop;
end $$;

-- PostgREST cachea el esquema; sin esto la API puede tardar en ver las
-- tablas nuevas y devolver "relation does not exist" ya creadas.
notify pgrst, 'reload schema';

-- ============================================================================
-- Registro de la app en el hub (/app/admin-hub) para que aparezca su tarjeta.
-- mis_apps es el índice de apps de este proyecto; no tiene owner_id (está
-- gateada por is_admin()/email en sus policies), así que esto es un seed y no
-- un dato de usuario. Idempotente: correr la migración dos veces no duplica
-- ni pisa una descripción que hayas cambiado a mano.
-- ============================================================================
insert into mis_apps (nombre, slug, descripcion, activo)
values ('Mi Día', 'mi-dia', 'Agenda, hábitos, gym, dinero y ánimo — uso personal', true)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
