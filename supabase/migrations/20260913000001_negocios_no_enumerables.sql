-- Cierra la enumeración de la tabla `negocios`.
--
-- EL PROBLEMA
-- La policy vigente (20260911000001_rls_seguridad.sql) es:
--
--   negocios_select ... using (is_active = true or owner_id = auth.uid())
--
-- El primer término no filtra por NADA salvo "está activo". La anon key va
-- embebida en el bundle de JavaScript de la landing — es pública por
-- diseño, cualquiera la saca del navegador en 10 segundos. Con ella y esa
-- policy:
--
--   GET /rest/v1/negocios?select=*
--
-- devuelve TODOS los negocios de la plataforma: nombre del negocio, nombre
-- del dueño, teléfono, WhatsApp, dirección, plan contratado, precio
-- congelado, fecha de vencimiento, si ya pagó alguna vez y el owner_id.
-- Es decir: la lista completa de clientes con sus teléfonos y cuánto paga
-- cada uno, servida a quien la pida. No hace falta ningún "hackeo": es una
-- sola petición HTTP.
--
-- Nada de esto era necesario para que funcione la página pública de
-- reservas. Esa página necesita UN negocio, buscado POR SLUG, y solo unos
-- campos de vitrina. Se puede dar exactamente eso sin dar lo demás.
--
-- LA SOLUCIÓN
-- 1. La policy de SELECT sobre `negocios` pasa a ser "solo el dueño"
--    (más /admin, que ya tenía la suya).
-- 2. Lo público sale por una función security definer que recibe el slug y
--    devuelve SOLO las columnas de vitrina. Al pedir un slug, no se puede
--    listar: sin saber el slug no hay nada que sacar, y los campos de
--    negocio (plan, precios, fechas, owner_id) ya no salen ni por error.
-- 3. Las policies públicas de barberia_servicios/horario/excepciones/citas
--    consultaban `negocios` DENTRO de un subquery para ver si el negocio
--    estaba activo. Esos subqueries respetan RLS, así que al apretar el
--    punto 1 se habrían roto solas (el visitante anónimo dejaría de ver
--    los servicios de la barbería y la página de reservas quedaría vacía).
--    Por eso se agrega el helper `es_negocio_activo`, también security
--    definer, y esas 4 policies pasan a usarlo.
--
-- El punto 3 es la parte fácil de pasar por alto: sin él, esta migración
-- "asegura" la tabla y de paso apaga las reservas en línea de todos los
-- clientes de Pro y Pro+.

-- ============================================================================
-- 1. Helper: ¿este negocio está activo? (sin exponer la fila completa)
-- ============================================================================
-- security definer para que corra con los privilegios del dueño de la
-- función y NO vuelva a chocar contra la policy de negocios cuando se le
-- llama desde adentro de otra policy. Devuelve un booleano y nada más — no
-- hay forma de sacarle datos de la fila.
create or replace function es_negocio_activo(p_negocio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from negocios n where n.id = p_negocio_id and n.is_active);
$$;

grant execute on function es_negocio_activo(uuid) to anon, authenticated;

-- ============================================================================
-- 2. Ficha pública por slug — lo único que /b/[slug] necesita
-- ============================================================================
-- Recibe el slug (no lista) y devuelve solo columnas de vitrina. Se quedan
-- FUERA a propósito: owner_id, dueno, plan, precio_custom, es_fundador,
-- trial_fin, ultimo_pago_at, telefono_contacto, accepted_terms_at,
-- created_at. Ninguna le sirve a quien va a agendar un corte.
create or replace function negocio_publico_por_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  nombre text,
  tipo business_type,
  direccion text,
  telefono text,
  whatsapp text,
  timezone text,
  is_active boolean,
  demo boolean,
  app_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.slug, n.nombre, n.tipo, n.direccion, n.telefono, n.whatsapp,
         n.timezone, n.is_active, n.demo, n.app_slug
  from negocios n
  where n.slug = p_slug and n.is_active;
$$;

grant execute on function negocio_publico_por_slug(text) to anon, authenticated;

-- ============================================================================
-- 3. La policy de SELECT deja de ser pública
-- ============================================================================
drop policy if exists "negocios_select" on negocios;
create policy "negocios_select" on negocios for select
  using (owner_id = auth.uid());

-- negocios_admin_all (is_admin(), definida en 20260911000001) sigue tal
-- cual y es la que deja que /admin vea todo. No se toca aquí.

-- ============================================================================
-- 4. Las policies públicas dejan de depender de leer `negocios`
-- ============================================================================
-- Mismo predicado de siempre ("el negocio está activo"), solo que ahora vía
-- el helper security definer del punto 1 en vez de un subquery que RLS ya
-- no dejaría pasar.
drop policy if exists "barberia_servicios_public_select" on barberia_servicios;
create policy "barberia_servicios_public_select" on barberia_servicios for select
  using (es_negocio_activo(negocio_id));

drop policy if exists "barberia_horario_public_select" on barberia_horario;
create policy "barberia_horario_public_select" on barberia_horario for select
  using (es_negocio_activo(negocio_id));

drop policy if exists "barberia_excepciones_public_select" on barberia_excepciones;
create policy "barberia_excepciones_public_select" on barberia_excepciones for select
  using (es_negocio_activo(negocio_id));

-- La de INSERT de citas públicas (reservar desde /b/[slug]) traía el mismo
-- subquery junto con sus otras condiciones. Se re-crea idéntica salvo por
-- el helper.
drop policy if exists "barberia_citas_public_insert" on barberia_citas;
create policy "barberia_citas_public_insert" on barberia_citas for insert
  with check (
    estado = 'pendiente'
    and es_negocio_activo(negocio_id)
  );
