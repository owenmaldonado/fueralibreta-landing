-- DIAGNÓSTICO de la gráfica de Fondita. No cambia nada, solo muestra.
-- Córrelo en Supabase > SQL Editor y mándame la salida.
--
-- Lo que quiero ver es UNA cosa: con qué día quedaron guardados tus
-- pedidos y gastos, y si ese día coincide con el día en que de verdad
-- los capturaste. Si no coincide, ahí está el problema (y la última
-- columna dice de cuánto es el desfase).

-- 1) La zona horaria que tiene guardada tu negocio.
--    Si sale NULL, la app usa la del celular/tablet que esté abierto.
select nombre, tipo, timezone
from negocios
where tipo = 'fonda';

-- 2) Los últimos 20 pedidos: el día con el que se guardaron (`fecha`)
--    contra el día real en que se crearon (`created_at`), leído en la
--    zona del negocio.
--
--    dias_de_desfase debe ser 0 en TODOS. Si sale -1, ese pedido se
--    guardó con el día de ayer: eso es exactamente lo que la gráfica
--    estaba pintando mal.
select
  p.fecha                                        as dia_guardado,
  p.hora                                         as hora_guardada,
  (p.created_at at time zone coalesce(n.timezone, 'America/Mexico_City'))::date as dia_real,
  (p.created_at at time zone coalesce(n.timezone, 'America/Mexico_City'))::time(0) as hora_real,
  p.fecha - (p.created_at at time zone coalesce(n.timezone, 'America/Mexico_City'))::date as dias_de_desfase,
  p.estado,
  p.total
from fonda_pedidos p
join negocios n on n.id = p.negocio_id
order by p.created_at desc
limit 20;

-- 3) Resumen: cuántos pedidos están bien y cuántos corridos, por desfase.
--    Lo ideal es una sola fila con dias_de_desfase = 0.
select
  p.fecha - (p.created_at at time zone coalesce(n.timezone, 'America/Mexico_City'))::date as dias_de_desfase,
  count(*) as cuantos_pedidos,
  min(p.created_at)::date as desde,
  max(p.created_at)::date as hasta
from fonda_pedidos p
join negocios n on n.id = p.negocio_id
group by 1
order by 1;

-- 4) Lo mismo para los gastos (se capturan desde el mismo botón "+").
select
  g.fecha as dia_guardado,
  g.categoria,
  g.monto
from fonda_gastos g
order by g.fecha desc
limit 15;

-- 5) Qué días tienen movimiento y por cuánto — esto es, tal cual, lo que
--    la gráfica debería estar pintando. Compáralo con lo que ves en
--    pantalla: si la barra está una posición corrida respecto de esta
--    lista, el problema es de la gráfica; si esta lista ya trae los días
--    equivocados, el problema es cómo se guardaron.
select p.fecha as dia, count(*) as pedidos, sum(p.total) as vendido
from fonda_pedidos p
where p.estado = 'entregado'
group by 1
order by 1 desc
limit 15;
