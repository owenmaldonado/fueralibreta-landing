-- Un solo apartado por horario: gana quien llegue primero.
--
-- EL PROBLEMA
-- Reservar desde /b/[slug] (por internet) ya estaba protegido: el endpoint
-- recalcula la disponibilidad del lado del servidor antes de insertar. Pero
-- cuando la cita se aparta desde DENTRO de la app, la comprobación de "ese
-- hueco está libre" vive solo en la pantalla, contra los datos que ese
-- dispositivo tenía en memoria. Dos personas apartando las 3:00 al mismo
-- tiempo desde dos celulares pasan las dos, y el barbero se entera cuando
-- llegan dos clientes a la misma hora.
--
-- Revalidar otra vez en el cliente no lo arregla: por más rápido que se
-- consulte, entre "consulté y estaba libre" y "guardé" siempre hay una
-- rendija. La única que puede decidir sin rendija es la base de datos.
--
-- SOLO 'pendiente', Y ESTO IMPORTA
-- El índice deja fuera todo lo que no sea una cita APARTADA:
--
--   * 'listo' — trabajo ya hecho, no un lugar reservado. Venta rápida
--     (components/dashboards/barberia-venta-rapida.tsx) guarda cada walk-in
--     como una cita 'listo' anclada al bloque de 30 minutos en curso, y dos
--     walk-ins en la misma media hora es lo más normal del mundo en una
--     barbería. Con un índice sobre todos los estados, el SEGUNDO walk-in
--     se rechazaría: le apagaríamos la caja al barbero justo cuando tiene
--     fila. Es exactamente el tipo de "arreglo" que causa el problema que
--     venía a resolver.
--   * 'cancelada' — cancelar tiene que LIBERAR el horario para volver a
--     apartarlo. Sin esta exclusión, una cita cancelada dejaría el hueco
--     bloqueado para siempre.
--
-- Cobrar una cita la pasa de 'pendiente' a 'listo', o sea que suelta su
-- lugar en el índice. Correcto: ese horario ya se usó.
--
-- Mover una cita a un horario ocupado también se rechaza, que es justo lo
-- que se quiere.

-- ============================================================================
-- Aviso previo si ya hay duplicados
-- ============================================================================
-- Si algún negocio YA tiene dos citas pendientes a la misma hora (de antes
-- de este índice), el `create unique index` de abajo truena con un mensaje
-- de Postgres que no dice cuáles son. Esto los nombra primero — dentro del
-- propio mensaje de error y con la consulta para arreglarlos en el hint,
-- porque es lo único que el SQL Editor de Supabase alcanza a mostrar.
do $$
declare
  lista text;
begin
  -- El detalle va DENTRO del mensaje de la excepción, no en `raise warning`.
  -- Los warnings no se ven en el SQL Editor de Supabase (solo muestra el
  -- error final), así que quien corría esto se topaba con "hay horarios
  -- repetidos" sin ninguna forma de saber CUÁLES. Pasó de verdad.
  select string_agg(format('%s a las %s (%s citas)', fecha, hora, n), '; ' order by fecha, hora)
  into lista
  from (
    select fecha, hora, count(*) as n
    from barberia_citas
    where estado = 'pendiente'
    group by negocio_id, fecha, hora
    having count(*) > 1
  ) d;

  if lista is not null then
    raise exception 'Hay horarios con más de una cita pendiente: %. Cancela o mueve las repetidas y vuelve a correr esta migración.', lista
      using hint = 'Para dejar la más vieja de cada horario y cancelar las demás: update barberia_citas set estado = ''cancelada'' where id in (select id from (select id, row_number() over (partition by negocio_id, fecha, hora order by created_at asc, id asc) as lugar from barberia_citas where estado = ''pendiente'') x where lugar > 1);';
  end if;
end $$;

-- ============================================================================
-- El candado
-- ============================================================================
create unique index if not exists barberia_citas_slot_apartado_unico
  on barberia_citas (negocio_id, fecha, hora)
  where estado = 'pendiente';

comment on index barberia_citas_slot_apartado_unico is
  'Un solo apartado por negocio/fecha/hora. Solo aplica a estado = pendiente: listo (walk-ins de Venta rápida, varios por bloque) y cancelada (libera el hueco) quedan fuera a propósito.';

notify pgrst, 'reload schema';
