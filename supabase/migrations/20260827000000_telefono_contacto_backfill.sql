-- Backfill de telefono_contacto para negocios dados de alta ANTES de que
-- /onboarding empezara a pedirlo (ver 20260826000000_telefono_contacto.sql)
-- — se queda en blanco solo si el negocio tampoco tenía whatsapp ni
-- telefono capturados en ningún lado. No toca telefono/whatsapp: siguen
-- siendo campos aparte (recuperación / WhatsApp de citas del negocio),
-- telefono_contacto es solo el número con el que el admin contacta al
-- dueño, arranca aquí con el mejor dato ya disponible.
alter table negocios add column if not exists telefono_contacto text;

update negocios
set telefono_contacto = coalesce(nullif(whatsapp, ''), nullif(telefono, ''))
where coalesce(telefono_contacto, '') = '';

-- Refresca el caché de esquema de PostgREST — sin esto, una columna nueva
-- (o recién agregada a mano como hotfix) puede seguir dando "column does
-- not exist" en la API hasta que algo más dispare un reload solo.
NOTIFY pgrst, 'reload schema';
