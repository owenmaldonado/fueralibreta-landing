-- Hotfix: schema cache de PostgREST desincronizado en fonda_pedido_items
-- Las columnas precio_unitario y costo_unitario existen en la tabla real
-- pero PostgREST no las ve, causando errores PGRST204 al insertar/actualizar.
--
-- Esto pasa cuando las migraciones originales (20260819000000_fonda_ganancia_snapshot.sql)
-- que agregaron estas columnas no se ejecutaron completamente contra el proyecto real
-- (este repo no corre `supabase db push` en CI, las migraciones se pasan a mano).
--
-- La solución es un NOTIFY que obliga a PostgREST a recargar su cache del schema.

notify pgrst, 'reload schema';
