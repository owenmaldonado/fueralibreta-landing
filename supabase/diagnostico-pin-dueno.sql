-- Diagnóstico de "PIN incorrecto" en el PIN maestro de dueño.
-- Todo esto es SOLO LECTURA, no modifica nada. Corre cada bloque y pega
-- el resultado.

-- 1) ¿Hay más de una definición de verificar_pin_dueno? (duplicados/
--    sobrecargas con distinta firma confunden a PostgREST sobre cuál
--    versión llama el cliente).
select proname, pronargs, proargnames, prosrc
from pg_proc
where proname in ('verificar_pin_dueno', 'set_pin_dueno', 'pin_dueno_configurado');

-- 2) Tu negocio_id real (para usarlo en los siguientes pasos) — reemplaza
--    'TU_EMAIL' por tu correo.
select n.id as negocio_id, n.nombre, n.slug
from negocios n
where n.owner_id = (select id from auth.users where email = 'TU_EMAIL');

-- 3) ¿Existe la fila y qué pinta tiene el hash guardado? (pin_hash no
--    revela el PIN, es seguro ver esto). Reemplaza NEGOCIO_ID con el id
--    del paso 2.
select negocio_id, pin_hash, updated_at
from negocio_pin_dueno
where negocio_id = 'NEGOCIO_ID';

-- 4) La prueba real: ¿"3412" hace match contra el hash guardado?
--    Reemplaza NEGOCIO_ID igual que arriba.
select
  negocio_id,
  crypt('3412', pin_hash) = pin_hash as coincide_3412
from negocio_pin_dueno
where negocio_id = 'NEGOCIO_ID';

-- 5) La función tal cual la llama el cliente (misma ruta que usa la app).
--    Reemplaza NEGOCIO_ID.
select verificar_pin_dueno('NEGOCIO_ID'::uuid, '3412');
