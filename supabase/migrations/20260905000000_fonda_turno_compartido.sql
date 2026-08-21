-- Owen reporta: el corte/gráficas de fonda no suman las ventas hechas por
-- un vendedor en OTRO dispositivo — la lista sí las muestra (llegan bien
-- por realtime, ver 20260904000000_gastos_caja_realtime.sql), pero
-- "Ventas de hoy" del dashboard y el Paso 1 de Cerrar Turno dan $0 o de
-- menos.
--
-- Causa real: turnoId (lib/turno-fonda.ts) vive en localStorage, POR
-- DISPOSITIVO — se generó para arreglar "Ventas de hoy en $0 tras un
-- refresh" (ver el comentario de ese archivo), nunca pensado para más de
-- un dispositivo vendiendo a la vez. fonda-dashboard.tsx y
-- fonda-cerrar-turno.tsx filtran pedidos con `p.turnoId ===
-- turnoActual.turnoId`, donde turnoActual sale del localStorage DE ESE
-- dispositivo — un pedido cobrado por un vendedor en su propia tablet trae
-- el turnoId que SU dispositivo generó, que nunca calza con el turnoId del
-- dispositivo del dueño, así que su corte lo excluye por completo aunque
-- el pedido sí llegó bien a Supabase.
--
-- Fix: reemplaza el filtro por turnoId (local, no compartible) por un
-- corte compartido — negocios.turno_fonda_cerrado_en, un timestamp que SÍ
-- vive en Supabase y ya se replica a todos los dispositivos vía el canal
-- de realtime que negocios YA tiene (suscribirseANegocioEnVivo,
-- lib/session.ts) — no hace falta ninguna tabla ni canal nuevo. "Pedidos
-- del turno actual" pasa a ser "entregados con created_at posterior al
-- último cierre compartido (o desde el inicio de hoy si nunca se ha
-- cerrado)", sin importar en qué dispositivo se cobraron.
alter table negocios add column if not exists turno_fonda_cerrado_en timestamptz;

notify pgrst, 'reload schema';
