-- Realtime para el CATÁLOGO: precios, servicios, platillos, stock y
-- empleados.
--
-- Todo lo transaccional (citas, ventas, pedidos, caja, gastos, clientes) ya
-- estaba en la publication `supabase_realtime`; el catálogo nunca se agregó.
-- Sin esto, el canal `catalogo-${negocio_id}` de lib/session.ts se suscribe
-- sin ningún error (Postgres no se queja de escuchar una tabla que no
-- publica) y simplemente no entrega NADA — el mismo síntoma silencioso que
-- ya nos pasó con fonda_pedidos (20260828000000) y con barberia_clientes
-- (20260909000000).
--
-- Lo que arregla, en la práctica:
--   * El dueño sube el precio de un servicio desde su celular y la tablet
--     del mostrador sigue cobrando el precio viejo el resto del día.
--   * La fonda marca un platillo como agotado y la otra pantalla lo sigue
--     ofreciendo: se levantan pedidos de algo que ya no hay.
--   * Dos cajas de abarrotes venden el mismo producto y cada una descuenta
--     stock sobre el número que tenía en memoria desde que abrió.
--
-- `add table` sin guarda truena si la tabla ya está en la publication, así
-- que cada una va dentro de su propio `if not exists` — mismo patrón
-- idempotente que el resto de las migraciones de realtime de este repo.

do $$
declare
  t text;
begin
  foreach t in array array[
    'barberia_servicios',
    'barberia_productos',
    'abarrotes_productos',
    'fonda_platillos'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- REPLICA IDENTITY FULL en las tablas donde el borrado importa.
--
-- Por defecto un DELETE solo publica la PRIMARY KEY en `payload.old`. El
-- canal de catálogo solo usa el evento como señal de "algo cambió, vuelve a
-- pedir el catálogo" y no lee payload.old, así que hoy funcionaría igual
-- sin esto. Se pone de todos modos porque el filtro de la suscripción es
-- `negocio_id=eq.${negocio_id}`: Supabase evalúa ese filtro contra las
-- columnas que vienen en el payload, y en un DELETE con replica identity
-- por defecto `negocio_id` NO viene — el evento se descartaría por no
-- pasar el filtro y borrar un platillo no le llegaría a la otra pantalla.
alter table barberia_servicios replica identity full;
alter table barberia_productos replica identity full;
alter table abarrotes_productos replica identity full;
alter table fonda_platillos replica identity full;

-- ============================================================================
-- negocio_empleados NO entra a realtime, y además se le tapa el pin_hash
-- ============================================================================
-- Se consideró agregarla (el síntoma sería el mismo: das de alta un empleado
-- y el kiosko no lo ofrece hasta recargar) y se decidió que NO: esa tabla
-- guarda `pin_hash`, y meterla en la publication manda el hash del PIN de
-- cada empleado por el WebSocket en cada INSERT/UPDATE. Un PIN de 4 dígitos
-- son 10 mil combinaciones — un hash filtrado se rompe al instante. El
-- roster cambia una vez cada varias semanas y ya se refresca al entrar al
-- kiosko; no vale ese precio.
--
-- Aparte, el hash NUNCA debió poder salir por PostgREST: la policy
-- `negocio_empleados_owner` (is_negocio_owner) le da al dueño acceso `for
-- all` a la tabla, y RLS es por FILA, no por columna — así que un
-- `select *` desde el navegador del dueño (justo lo que hacía
-- fetchEmpleadosParaCache en lib/local-cache.ts) traía los hashes de todos
-- sus empleados al cliente. El código ya no los pide, pero eso es una
-- convención, no una garantía: el grant por columna sí lo es.
--
-- La Edge Function verificar-pin usa la service_role key, que salta grants
-- y RLS, así que verificar/cambiar PIN sigue funcionando igual.
revoke select on negocio_empleados from anon, authenticated;
grant select (id, negocio_id, nombre, rol, user_id, activo, created_at)
  on negocio_empleados to anon, authenticated;
