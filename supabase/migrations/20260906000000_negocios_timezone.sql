-- Business.timezone existía en el tipo de TypeScript desde hace rato pero
-- `negocios` nunca tuvo una columna real para guardarlo — businessFromRow/
-- businessToRow (lib/data.ts) tampoco lo mapeaban. Resultado: negocio.timezone
-- siempre llegaba undefined desde Supabase, y hoyEnZona() (antes en
-- lib/mock.ts, ahora lib/fecha.ts) caía SIEMPRE a su fallback hardcodeado —
-- la zona horaria "real" usada por todos los negocios, sin importar dónde
-- estuvieran, nunca la que el negocio de verdad tenía.
--
-- Ahora se detecta sola: createBusiness() (lib/mock.ts) guarda
-- getDeviceTimezone() al dar de alta el negocio (una sola vez, en
-- /onboarding) — nullable porque los negocios ya existentes no tienen
-- forma de saber retroactivamente en qué dispositivo/zona se dieron de
-- alta; para esos, hoyEnZona() sigue cayendo a la zona del dispositivo que
-- esté viendo el dashboard en ese momento (mismo fallback de siempre, ya
-- no hardcodeado a una sola ciudad).
-- set local row_security = off: el SQL Editor de Supabase corre por
-- default como `postgres` (BYPASSRLS, ignora RLS de por sí), así que esto
-- normalmente no cambia nada — pero si Owen lo corre bajo un rol/contexto
-- distinto (impersonando authenticated, por ejemplo) esto evita que un
-- ALTER/UPDATE choque con las policies de `negocios`. `alter table ...
-- add column` es DDL: RLS nunca aplica a DDL de por sí (solo a SELECT/
-- INSERT/UPDATE/DELETE), así que un error ahí no puede ser de RLS — si
-- vuelve a fallar, es otra cosa (permisos del rol, o error de sintaxis) y
-- hace falta el mensaje de error exacto para diagnosticarlo.
set local row_security = off;

alter table negocios add column if not exists timezone text;

notify pgrst, 'reload schema';
