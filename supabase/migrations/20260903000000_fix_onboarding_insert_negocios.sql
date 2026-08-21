-- Owen reporta: 403 / "new row violates row-level security policy for table
-- negocios" (42501) en POST /rest/v1/negocios al crear un negocio nuevo en
-- /onboarding. Causa: en la primera limpieza de RLS de este hilo ("negocios:
-- enable RLS, solo policy negocios_select") se borraron negocios_insert y
-- negocios_update sin volver a crearlas — 20260815000000_esquema.sql
-- siempre las tuvo las 3 juntas (select/insert/update), pero como este repo
-- no corre `supabase db push` en CI, el DROP a mano en el SQL Editor del
-- proyecto real nunca se revirtió solo.
--
-- Se re-crean con el mismo nombre/definición que la migración original (no
-- los nombres nuevos "Users can insert own negocio" que se propusieron —
-- negocios_select ya cubre "el dueño ve su propio negocio aunque esté
-- inactivo" vía `owner_id = auth.uid()` en su propio OR, así que una policy
-- de select aparte para authenticated sería una segunda policy permisiva
-- redundante sobre la misma tabla/comando, no un fix adicional).
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

notify pgrst, 'reload schema';
