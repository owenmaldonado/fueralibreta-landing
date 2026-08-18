-- El ConsentBanner solo se muestra en "/" antes de iniciar sesión
-- (app/page.tsx redirige del lado del servidor en cuanto hay usuario
-- logueado), así que en ese momento todavía no existe un negocio: el
-- consentimiento se guarda con negocio_id null. Esto alinea la tabla
-- (creada manualmente) con ese flujo, sin tronar si ya está así.
alter table consentimientos alter column negocio_id drop not null;

alter table consentimientos enable row level security;

drop policy if exists "consentimientos_insert_anon" on consentimientos;
create policy "consentimientos_insert_anon"
  on consentimientos for insert
  to anon, authenticated
  with check (negocio_id is null);
