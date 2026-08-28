-- LA CAUSA DE VERDAD del "la gráfica de Fondita se lleva todo al día
-- anterior". Cinco días buscándolo, y estaba en el tipo de una columna.
--
-- CÓMO SE VIO
-- Owen corrió `select fecha, count(*) from fonda_pedidos group by 1` y la
-- columna salió así:
--
--     dia
--     2026-08-28 00:00:00+00
--     2026-08-27 00:00:00+00
--
-- Con hora y con zona. Pero `fonda_pedidos.fecha` está declarada `date` en
-- el esquema de este repo: debería salir "2026-08-28" y nada más. En esa
-- base es `timestamptz`.
--
-- POR QUÉ PASÓ
-- La tabla venía de una versión anterior donde esa columna era timestamptz.
-- `create table if not exists` no toca una tabla que ya existe, y
-- `add column if not exists` no toca una columna que ya existe — ninguno de
-- los dos cambia un tipo. Así que la declaración `date` del esquema nunca
-- se aplicó ahí y la columna se quedó como estaba, en silencio.
--
-- POR QUÉ ROMPÍA LA GRÁFICA
-- La app guarda el día del negocio como texto: "2026-08-28". Postgres lo
-- mete en una columna timestamptz y, con la sesión en UTC, queda como
-- `2026-08-28 00:00:00+00`. Medianoche UTC del 28 es, en México, el 27 a
-- las 6 de la tarde. Cualquier cosa que lea ese texto como un instante
-- —`new Date(...)`, que es lo que hacía la gráfica— contesta 27.
--
-- Y por eso solo se notaba AL REFRESCAR: recién capturado, el pedido vivía
-- en memoria con el string "2026-08-28" y todo cuadraba; al recargar volvía
-- de la base como timestamptz y se corría un día entero.
--
-- QUÉ HACE ESTA MIGRACIÓN
-- Devuelve esas columnas a `date`. El dato NO se pierde ni se mueve:
-- `at time zone 'UTC'` lee el instante en la misma zona en la que se
-- escribió, así que `2026-08-28 00:00:00+00` vuelve a ser exactamente
-- `2026-08-28`.
--
-- El código ya no depende de esto (lib/data.ts recorta a 10 caracteres al
-- leer, así que funciona con columnas de los dos tipos). Esto es para dejar
-- la base como el esquema siempre dijo que estaba, y que la siguiente
-- consulta que alguien escriba a mano en el SQL Editor tampoco mienta.

do $$
declare
  t text;
  tipo_actual text;
begin
  -- SOLO columnas que guardan un DÍA. Quedan fuera a propósito
  -- barberia_caja.fecha y abarrotes_ventas.fecha: esas dos sí son
  -- timestamptz de verdad (guardan el momento exacto del movimiento) y
  -- convertirlas sí perdería información real.
  foreach t in array array[
    'barberia_excepciones',
    'barberia_citas',
    'barberia_cortes',
    'fondita_menu_dia',
    'fonda_pedidos',
    'fonda_gastos',
    'fondita_cortes',
    'fondita_mermas',
    'abarrotes_fiado_movimientos',
    'abarrotes_gastos',
    'abarrotera_cortes',
    'abarrotera_mermas'
  ] loop
    select c.data_type into tipo_actual
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t and c.column_name = 'fecha';

    -- Si la tabla no existe en esta base, o la columna ya es `date`, no hay
    -- nada que hacer — por eso esto se puede correr las veces que sea.
    if tipo_actual is null or tipo_actual = 'date' then
      continue;
    end if;

    raise notice 'Convirtiendo %.fecha de % a date', t, tipo_actual;

    if tipo_actual = 'timestamp with time zone' then
      execute format(
        'alter table public.%I alter column fecha type date using (fecha at time zone ''UTC'')::date',
        t
      );
    else
      -- timestamp sin zona (u otro tipo con fecha adentro): el cast directo
      -- basta, no hay zona que deshacer.
      execute format('alter table public.%I alter column fecha type date using fecha::date', t);
    end if;

    -- El default también viene del tipo viejo (now() en vez de
    -- current_date) — si no se cambia, la primera fila que se inserte sin
    -- fecha vuelve a traer el problema por la puerta de atrás.
    execute format('alter table public.%I alter column fecha set default current_date', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
