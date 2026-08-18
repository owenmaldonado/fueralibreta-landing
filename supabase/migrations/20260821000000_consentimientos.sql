-- Prueba legal de consentimiento (cookies / Aviso de Privacidad / Términos).
-- Hasta ahora <ConsentBanner /> solo guardaba la decisión en el localStorage
-- del navegador de cada visitante — nada quedaba del lado del servidor, así
-- que no había forma de acreditar ante Profeco/INAI que alguien sí aceptó.
--
-- Pega este archivo completo en Supabase → SQL Editor → New query → Run. Es
-- seguro volver a correrlo (usa IF NOT EXISTS / OR REPLACE donde aplica).

-- Marca cuándo el DUEÑO de un negocio aceptó el checkbox obligatorio de
-- Términos/Aviso de Privacidad en /onboarding (independiente de la tabla
-- consentimientos de abajo, que es la de visitantes anónimos del banner).
alter table negocios add column if not exists accepted_terms_at timestamptz;

create table if not exists consentimientos (
  id uuid primary key default gen_random_uuid(),
  -- Casi siempre null: el banner de cookies solo se muestra en "/" (landing),
  -- antes de que exista sesión o negocio. Se deja la columna por si algún
  -- día se captura consentimiento ya con negocio identificado.
  negocio_id uuid references negocios(id) on delete set null,
  ip text,
  user_agent text,
  acepto_terminos boolean not null default false,
  acepto_privacidad boolean not null default false,
  acepto_cookies boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists consentimientos_created_at_idx on consentimientos(created_at desc);
create index if not exists consentimientos_negocio_id_idx on consentimientos(negocio_id);

alter table consentimientos enable row level security;

-- Público (visitante sin sesión, vía /api/public/consent): solo puede
-- insertar su propio registro de consentimiento, nunca leer, editar o
-- borrar los de alguien más. El rate limit real vive en la app
-- (checkRateLimit en /api/public/consent), no en Postgres.
drop policy if exists "consentimientos_public_insert" on consentimientos;
create policy "consentimientos_public_insert" on consentimientos for insert
  to anon
  with check (true);

-- Solo el super-admin (is_admin()) puede ver el historial de consentimientos
-- — es la prueba que Owen necesita poder mostrar ante Profeco/INAI. Mismo
-- patrón que el resto de las tablas *_admin_all.
drop policy if exists "consentimientos_admin_all" on consentimientos;
create policy "consentimientos_admin_all" on consentimientos for all
  using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';
