-- Owen reporta: "fiados no se guardan" en Abarrotera (NuevoFiadoForm,
-- components/quick-add/abarrotes-quick-add.tsx). Mismo diagnóstico que el
-- de barberia_citas/barberia_caja/fonda_pedidos/abarrotes_ventas
-- (20260907000000_citas_caja_pedidos_ventas_rol_reload.sql): la columna SÍ
-- es correcta y SÍ está definida en el repo —
-- 20260901000000_fiados_trazabilidad_empleado.sql agregó empleado_id/
-- empleado_nombre_cache/empleado_rol_cache a abarrotes_fiados — pero, a
-- diferencia de fonda_gastos/abarrotes_gastos, nunca tuvo su propio
-- re-assert de emergencia. Este repo no corre `supabase db push` en CI,
-- así que esa migración casi seguro nunca terminó de aplicarse contra el
-- proyecto real (o el schema cache de PostgREST se quedó viejo).
--
-- Por qué "no se guardan" y no solo "sin badge de quién lo dio de alta":
-- fiadoToRow (lib/data.ts) siempre incluye las 3 columnas en el insert —
-- empleado_id/empleado_nombre_cache/empleado_rol_cache en null si nadie
-- tiene PIN activo (camposEmpleado() devuelve {} en modo dueño) — así que
-- el 400 de PostgREST por columna faltante tumba el insert completo a
-- abarrotes_fiados, tanto si lo da de alta un vendedor con PIN como el
-- dueño sin ninguno. update() ya había aplicado el cambio optimista en el
-- estado local (por eso se ve "guardado" un instante), pero
-- syncTenantDiff/mustInsert falla en segundo plano y nunca llega a
-- Supabase — al recargar o desde otro dispositivo el fiado desaparece.
--
-- NO se quita empleado_rol_cache del insert en lib/data.ts: es la columna
-- que pinta el badge "Dueño" vs "Nombre · Vendedor/Encargado" en
-- FiadosPage (EmpleadoBadge) — quitarla apagaría esa función en vez de
-- arreglar la causa real.
alter table abarrotes_fiados add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_fiados add column if not exists empleado_nombre_cache text;
alter table abarrotes_fiados add column if not exists empleado_rol_cache text;

notify pgrst, 'reload schema';
