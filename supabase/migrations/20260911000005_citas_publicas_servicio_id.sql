-- Bloqueo real por duración de servicio (getDaySlots, lib/agenda.ts):
-- antes solo marcaba ocupado el slot EXACTO donde empezaba la cita — un
-- corte de 45 min a las 9:00 dejaba 9:30 libre, como si el barbero ya
-- estuviera desocupado. Ahora bloquea todos los slots de 30 min que la
-- cita realmente cubre, según la duración del servicio agendado — pero
-- para calcular eso en la reserva pública (/b/[slug]) hace falta saber
-- QUÉ servicio se agendó, y barberia_citas_publicas (la vista sin datos
-- personales que usa esa página, ver 20260815000000_esquema.sql) solo
-- exponía negocio_id/fecha/hora/estado. servicio_id no es dato personal —
-- es el mismo criterio que ya justificaba exponer fecha/hora.
create or replace view barberia_citas_publicas as
  select negocio_id, fecha, hora, estado, servicio_id
  from barberia_citas
  where estado <> 'cancelada';

grant select on barberia_citas_publicas to anon, authenticated;

notify pgrst, 'reload schema';
