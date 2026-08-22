-- Owen reporta 3 tablas UNRESTRICTED tras correr 20260911000001/000002:
-- barberia_citas_publicas, negocio_vendedores, abarrotera_pedidos.
--
-- barberia_citas_publicas: es una VIEW (ver 20260815000000_esquema.sql),
-- no una tabla — Postgres no soporta ENABLE ROW LEVEL SECURITY sobre
-- vistas, así que el Table Editor SIEMPRE la va a marcar "Unrestricted".
-- No es un hueco: la vista ya solo expone negocio_id/fecha/hora/estado
-- (nunca nombre/teléfono de clientes) y es pública a propósito. No se toca
-- aquí — nada que hacer.
--
-- negocio_vendedores y abarrotera_pedidos: NO existen en ningún archivo de
-- este repo (ni en supabase/migrations/, ni referenciadas desde el código
-- — se buscó "negocio_vendedores" y "abarrotera_pedidos" en todo el
-- proyecto, cero resultados). No las creamos nosotros ni las usa la app
-- hoy — probablemente sobras de una versión anterior del esquema o de una
-- edición manual en el Table Editor (mismo tipo de incidente ya
-- documentado en 20260902000000_fix_citas_publicas_rls_realtime.sql).
--
-- Sin saber su estructura real no se puede escribir una policy con
-- negocio_id a ciegas (podría tener otro nombre de columna, o ninguno) —
-- pero SÍ es seguro habilitar RLS sin ninguna policy: con RLS encendido y
-- cero policies, Postgres niega TODO acceso (select/insert/update/delete)
-- a cualquier rol que no sea el dueño de la tabla — anon/authenticated
-- dejan de poder leer o escribir una sola fila, sin necesidad de saber qué
-- columnas tiene. Cierra el hueco de exposición ya mismo; decidir si se
-- borran (recomendado si de verdad no las usa nada) o se documentan
-- queda para cuando se confirme qué son.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'negocio_vendedores') then
    execute 'alter table public.negocio_vendedores enable row level security';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'abarrotera_pedidos') then
    execute 'alter table public.abarrotera_pedidos enable row level security';
  end if;
end $$;

notify pgrst, 'reload schema';
