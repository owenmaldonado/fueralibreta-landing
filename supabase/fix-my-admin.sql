-- Diagnóstico y fix para el 403/"role actual: desconocido" en /admin.
--
-- Causa real: profiles.id es FK a auth.users(id) on delete cascade (ver
-- supabase/migrations/20260815000000_esquema.sql:1279-1280), así que una
-- fila "huérfana" en profiles solo existe si hay DOS filas en auth.users
-- con el mismo email (dos altas — p. ej. password + Google sin auto-link).
-- Cada una generó su propia fila en profiles vía el trigger
-- on_auth_user_created, y la sesión activa hoy resuelve a un id distinto
-- del que quedó marcado role='admin'.
--
-- Por eso NO se borra ni se reescribe ningún id aquí: correr
-- DELETE FROM profiles WHERE email=... seguido de un INSERT recrearía el
-- mismo duplicado (una fila por cada auth.users con ese email) y de paso
-- perdería is_banned/plan/created_at de las filas existentes sin necesidad.
--
-- Corre esto en el SQL Editor de Supabase con tu propia cuenta (o con la
-- service_role key), un bloque a la vez.

-- 1) Diagnóstico: ver cuántas cuentas de Auth y filas de profiles hay para
--    este email. Si "total_auth_users" da 2+, confirma la causa de arriba.
select
  (select count(*) from auth.users where lower(trim(email)) = 'owenxmaldonado100@gmail.com') as total_auth_users,
  (select count(*) from profiles where lower(trim(email)) = 'owenxmaldonado100@gmail.com') as total_profiles;

select id, email, created_at, last_sign_in_at
from auth.users
where lower(trim(email)) = 'owenxmaldonado100@gmail.com'
order by created_at;

select id, email, role, is_banned, created_at
from profiles
where lower(trim(email)) = 'owenxmaldonado100@gmail.com'
order by created_at;

-- 2) Fix real: garantiza role='admin' en TODAS las filas de profiles para
--    este email, sin importar cuál id sea el de la sesión activa en cada
--    momento. Es seguro repetirlo (idempotente) y no otorga nada nuevo:
--    requireAdminUser() ya exige este email exacto ANTES de mirar el role
--    (ver lib/admin-auth.ts), así que cualquier fila que ya pasa ese
--    candado puede marcarse admin sin abrir una puerta nueva.
update profiles
set role = 'admin'
where lower(trim(email)) = 'owenxmaldonado100@gmail.com'
  and role <> 'admin';

-- 3) Opcional, solo si el diagnóstico del paso 1 confirmó 2+ filas en
--    auth.users y quieres quedarte con una sola cuenta: hazlo a mano desde
--    Authentication > Users en el dashboard de Supabase (ahí puedes ver
--    cuál es la que usas hoy para loguearte por last_sign_in_at) y borra la
--    otra. El ON DELETE CASCADE de profiles.id se encarga solo de limpiar
--    su fila en profiles cuando borres esa cuenta de auth.users.
