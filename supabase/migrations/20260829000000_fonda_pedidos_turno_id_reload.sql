-- Owen reporta en consola: POST a fonda_pedidos -> 400, PGRST204 "Could not
-- find the 'turno_id' column of 'fonda_pedidos' in the schema cache".
--
-- turno_id YA existe en el código desde 20260823000000_fonda_turno_id.sql
-- (que ya termina en `notify pgrst, 'reload schema'`) — este repo no tiene
-- ningún pipeline de CI/CD que corra `supabase db push` solo (ver
-- .github/workflows/, solo auto-merge.yml), así que ese migration casi
-- seguro nunca se aplicó contra el proyecto real de Supabase, o el
-- PostgREST de ese proyecto se quedó con el schema cache viejo. Este
-- archivo es un re-assert idempotente (add column if not exists, sin
-- tronar si ya existe) + otro NOTIFY, para desatorar el cache si el
-- problema es justo eso.
--
-- OJO: esto NO reemplaza aplicar el migration original si de verdad nunca
-- corrió — hace falta correr `supabase db push` (o pegar el SQL a mano en
-- el SQL Editor de Supabase) contra el proyecto real; nada en este repo lo
-- hace por sí solo.
alter table fonda_pedidos add column if not exists turno_id uuid;
create index if not exists fonda_pedidos_turno_id_idx on fonda_pedidos(turno_id);

notify pgrst, 'reload schema';
