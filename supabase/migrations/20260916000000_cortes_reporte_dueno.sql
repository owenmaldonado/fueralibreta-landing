-- Reporte de cierres para el dueño (/app/cortes).
--
-- LO QUE PIDIÓ OWEN
-- "sigue lo mismo sin decirle al vendedor cuánto debería tener, y si hubo
-- alguna diferencia pudo haberle robado o así. Quiero que en el panel del
-- dueño salga lo que hizo su vendedor en el cierre, y ahí vea
-- inconsistencias como esa y le avise: ¡le faltó tanto!"
--
-- La buena noticia es que el dato YA se guarda: los tres wizards de cierre
-- escriben ventas_calculadas, fondo_inicial, gastos, efectivo_real y
-- diferencia (efectivo contado menos lo que debería haber). Lo que faltaba
-- era poder decir QUIÉN cerró con el rol correcto, y una pantalla que lo
-- leyera.
--
-- Falta `empleado_rol_cache` en las tres tablas de cortes: sin rol,
-- EmpleadoBadge hace `const esDueno = !rol || rol === "dueno"` y pinta
-- "Dueño" — el mismo bug que ya apareció en los pedidos de fonda, donde el
-- cierre del vendedor se vería como si lo hubiera hecho el dueño. Que es
-- exactamente lo contrario de lo que este reporte sirve para ver.

alter table barberia_cortes  add column if not exists empleado_rol_cache text;
alter table fondita_cortes   add column if not exists empleado_rol_cache text;
alter table abarrotera_cortes add column if not exists empleado_rol_cache text;

-- Por si a alguna base le falta alguna de las otras (las agrega
-- 20260815000000, pero ya sabemos que una base que viene de una versión
-- vieja puede no tenerlas — es justo lo que pasó con dias_recordatorio).
alter table barberia_cortes   add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table barberia_cortes   add column if not exists empleado_nombre_cache text;
alter table fondita_cortes    add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fondita_cortes    add column if not exists empleado_nombre_cache text;
alter table abarrotera_cortes add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotera_cortes add column if not exists empleado_nombre_cache text;

-- Cerrar un turno desde otro dispositivo debe aparecerle al dueño sin que
-- tenga que recargar — misma razón por la que ya están en la publicación
-- las citas, los pedidos y las ventas. Y es de las cosas que MÁS urge ver
-- en vivo: es el momento en que el vendedor entrega el dinero.
--
-- `add table` sin guarda truena si la tabla ya está publicada, así que cada
-- una va dentro de su propio if — mismo patrón idempotente que el resto de
-- las migraciones de realtime de este repo.
do $$
declare
  t text;
begin
  foreach t in array array['barberia_cortes', 'fondita_cortes', 'abarrotera_cortes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Consultar los cortes por negocio y fecha es lo único que hace la pantalla
-- nueva; sin índice eso es un scan completo de la tabla en cada visita.
create index if not exists barberia_cortes_negocio_fecha_idx   on barberia_cortes (negocio_id, fecha desc);
create index if not exists fondita_cortes_negocio_fecha_idx    on fondita_cortes (negocio_id, fecha desc);
create index if not exists abarrotera_cortes_negocio_fecha_idx on abarrotera_cortes (negocio_id, fecha desc);

notify pgrst, 'reload schema';
