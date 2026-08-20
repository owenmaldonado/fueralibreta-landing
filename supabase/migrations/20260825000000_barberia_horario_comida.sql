-- Hora de comida por día (barbería): el horario no es corrido — un negocio
-- puede cerrar de 14:00 a 15:00 para comer sin que esa franja se muestre
-- como disponible ni en la Agenda del dueño ni en la reserva pública
-- (/b/[slug], ver getAvailableSlots en lib/agenda.ts). Nullable: sin valor
-- en ninguna de las dos columnas = ese día no tiene hora de comida (el
-- comportamiento de siempre, horario corrido).
alter table barberia_horario add column if not exists comida_inicio time;
alter table barberia_horario add column if not exists comida_fin time;
