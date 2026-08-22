-- Owen reporta: negocio_empleados tiene "Maria" y "maria" para el mismo
-- negocio (b2283583-901b-4c3d-8f17-593e6544d503) — dos filas, dos PINs,
-- dos empleado_id distintos para la misma persona real. El unique
-- (negocio_id, nombre) que ya existía (20260815000000_esquema.sql) es
-- case-SENSITIVE en Postgres por default, así que nunca bloqueó esto.
--
-- Efecto visible: el filtro "por persona" de Caja/Gastos (antes agrupaba
-- por el nombre cacheado, ver reload de esas pantallas en este mismo
-- commit) partía a esa persona en dos chips — cada uno solo con la mitad
-- de sus movimientos, así que uno de los dos siempre se veía en $0.
--
-- Este archivo es la mitad de infraestructura del fix (evita que se
-- repita); la otra mitad (agrupar por empleado_id en vez de por nombre) ya
-- está en el código de Caja/Gastos. La fusión de LOS DOS registros que ya
-- existen para Maria/maria es cirugía de datos de un negocio específico —
-- no va aquí, se corre aparte a mano (ver mensaje de chat).

-- 1) Normaliza nombres existentes a Title Case ANTES de crear el índice
-- único — si dos filas ya difieren solo en mayúsculas, este UPDATE por sí
-- solo NO las fusiona (updates de un unique index nunca chocan consigo
-- mismos en la misma fila), así que si sigue habiendo un duplicado real,
-- el índice de abajo truena — es la señal de que hace falta correr la
-- fusión a mano antes de reintentar esta migración.
update negocio_empleados
set nombre = initcap(trim(regexp_replace(nombre, '\s+', ' ', 'g')))
where nombre <> initcap(trim(regexp_replace(nombre, '\s+', ' ', 'g')));

-- 2) Reemplaza el unique constraint case-sensitive por un índice único
-- case-insensitive — "Maria" y "maria" ya no pueden coexistir para el
-- mismo negocio de aquí en adelante.
alter table negocio_empleados drop constraint if exists negocio_empleados_negocio_id_nombre_key;

create unique index if not exists negocio_empleados_negocio_id_lower_nombre_key
  on negocio_empleados (negocio_id, lower(nombre));

-- 3) crear_empleado (RPC, security definer indirecto vía negocio_empleados)
-- normaliza a Title Case server-side también — defensa en profundidad por
-- si algo más además de app/app/empleados/page.tsx llega a insertar ahí
-- (esa pantalla ya normaliza en el cliente antes de llamar la RPC, ver
-- normalizarNombreEmpleado en lib/empleados.ts).
create or replace function crear_empleado(p_negocio_id uuid, p_nombre text, p_rol text, p_pin text)
returns negocio_empleados
language plpgsql
as $$
declare
  fila negocio_empleados;
begin
  insert into negocio_empleados (negocio_id, nombre, rol, pin_hash)
  values (p_negocio_id, initcap(trim(regexp_replace(p_nombre, '\s+', ' ', 'g'))), p_rol, crypt(p_pin, gen_salt('bf')))
  returning * into fila;
  return fila;
end;
$$;

notify pgrst, 'reload schema';
