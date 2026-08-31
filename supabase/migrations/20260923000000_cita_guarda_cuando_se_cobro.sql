-- Una cita ahora guarda CUÁNDO SE COBRÓ, no solo a qué hora estaba agendada.
--
-- EL BUG (Owen: "le di la 2da vez a cerrar turno y sale que se hicieron 300
-- en cortes, debería estar en 0 porque no hice ningún movimiento")
--
-- Para decidir si un corte entra en el turno que se está cerrando, la app
-- comparaba la HORA DE LA CITA contra la hora del último cierre. Pero la
-- hora de la cita es a la que está agendada — no a la que entró el dinero.
-- Son dos cosas distintas:
--
--   cierre a las 6:45pm
--   cita agendada a las 8pm, cobrada a las 5pm  -> "20:00" > "18:45" = sí
--       vuelve a contar en el turno nuevo, sin que nadie haga nada. Esos
--       son los $300 que salieron de la nada.
--
--   cita agendada a las 10am, cobrada a las 7pm -> "10:00" > "18:45" = no
--       el dinero entró después del cierre pero queda fuera del corte.
--
-- Las dos formas de fallar existían al mismo tiempo, así que el número podía
-- salir de más o de menos según cómo estuviera repartida la agenda del día.
--
-- `cobrado_en` se escribe en el momento en que la cita pasa a "listo", que
-- es cuando de verdad se cobra. Con eso el corte compara instantes reales
-- contra el instante del cierre, y ya no hay forma de que se cuele algo que
-- no pasó en ese turno.
--
-- NO se rellena hacia atrás a propósito: no hay dato de cuándo se cobró una
-- cita vieja, e inventarlo (usando created_at, que es cuándo se AGENDÓ, o la
-- hora de la cita) volvería a meter el mismo error pero disfrazado de dato
-- bueno. Las citas viejas se quedan en null y la app cae al criterio de
-- antes para ellas — impreciso, pero honesto y sin sorpresas en el
-- histórico.

alter table barberia_citas add column if not exists cobrado_en timestamptz;

-- Lo que consulta el corte es "las citas cobradas de este negocio, de hoy".
create index if not exists barberia_citas_cobrado_en_idx
  on barberia_citas (negocio_id, cobrado_en desc);

notify pgrst, 'reload schema';
