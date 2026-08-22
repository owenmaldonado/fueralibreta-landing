-- Owen reporta: en plan básico las ganancias se borran al refrescar — ventas
-- y gastos se quedan, pero la ganancia desaparece. Se pidió revisar
-- cleanInsert/cleanUpdate de fonda_platillos y asegurar que costo se incluya
-- en el guardado.
--
-- Verificado: el código YA está bien. platilloToRow/platilloFromRow
-- (lib/data.ts) ya incluyen costo en el insert/update, PlatilloForm (Menú >
-- Editar platillo) ya tiene el campo, y el guardado pasa por update() ->
-- diffAndSync -> cleanInsert/cleanUpdate (el blindaje anti-PGRST204 de
-- 20260911000000_trazabilidad_empleado_safety_net.sql). Nada que tocar ahí.
--
-- La causa real, mismo patrón de siempre: fonda_platillos.costo SÍ está
-- definida en el repo (20260815000000_esquema.sql) pero nunca tuvo su
-- propio re-assert de emergencia — si esa migración grande no terminó de
-- aplicarse completa contra el proyecto real, PostgREST rechaza el insert/
-- update con PGRST204 al mandar "costo". Y aquí es donde el blindaje de
-- cleanInsert/cleanUpdate EXPLICA el síntoma exacto reportado: al detectar
-- PGRST204 en "costo", reintenta el guardado SIN esa columna para no perder
-- el platillo completo — el nombre/precio se guardan bien (por eso ventas y
-- gastos "se quedan"), pero costo nunca llega a Supabase, así que al
-- refrescar (recarga desde la base, no desde el estado local) la ganancia
-- calculada como sum((precio - costo) * cantidad) da 0 — no hay costo que
-- restar.
alter table fonda_platillos add column if not exists costo numeric(10, 2);

notify pgrst, 'reload schema';
