-- Parte 4 de PWA (vender sin conexión): descuento de stock atómico para la
-- subida de la cola de ventas pendientes (ver lib/sync-queue.ts).
--
-- Hoy el sync online manda un UPDATE abarrotes_productos SET stock = <valor
-- final calculado en cliente>, sin ningún WHERE de concurrencia — dos
-- dispositivos vendiendo el mismo producto offline al mismo tiempo pisarían
-- el descuento del otro al sincronizar. Esta función resta la CANTIDAD
-- vendida (no un valor final) contra el stock real en Postgres, con
-- "select ... for update" para serializar llamadas concurrentes sobre la
-- misma fila: la segunda ve el stock YA descontado por la primera.
--
-- security invoker (el default de Postgres): corre con los permisos de
-- quien la llama, así que sigue protegida por la policy
-- abarrotes_productos_owner que ya existe — no se toca RLS ni el esquema
-- existente, solo se agrega esta función nueva.
create or replace function descontar_stock_atomico(p_producto_id uuid, p_cantidad numeric)
returns table(stock_final numeric, alcanzaba boolean)
language plpgsql
as $$
declare
  v_stock_antes numeric;
begin
  select stock into v_stock_antes from abarrotes_productos where id = p_producto_id for update;

  if v_stock_antes is null then
    raise exception 'Producto % no encontrado o sin permiso', p_producto_id;
  end if;

  update abarrotes_productos
  set stock = greatest(0, v_stock_antes - p_cantidad)
  where id = p_producto_id;

  return query select greatest(0, v_stock_antes - p_cantidad), (v_stock_antes >= p_cantidad);
end;
$$;
