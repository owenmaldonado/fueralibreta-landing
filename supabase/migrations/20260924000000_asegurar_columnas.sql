-- Reasegurar TODAS las columnas que la app espera. Idempotente.
--
-- EL BUG QUE CIERRA (Owen: "sí está el costo y el precio de venta, de hecho
-- hasta hace la suma, cuando vendo productos dice se cobrará tanto pero tu
-- ganancia es de tanto, pero en la gráfica sale lo que cobro no lo que gano")
--
-- La gráfica SÍ resta el costo. El problema es que el costo nunca llegaba a
-- la base: `barberia_caja.costo` se agrega en la migración 20260912000000, y
-- el archivo `correr-en-supabase.sql` que le fui pasando arrancaba en la
-- 20260914 — daba por hecho que todo lo anterior ya estaba corrido, y eso no
-- estaba garantizado.
--
-- Lo que lo volvía invisible: cuando a una tabla le falta una columna,
-- cleanInsert (lib/data.ts) reintenta el insert SIN ella para no perder la
-- fila. Es lo correcto — más vale guardar la venta sin el costo que perder
-- la venta — pero el único rastro es un console.warn que nadie mira. Así
-- que: la venta se guardaba, el diálogo mostraba bien la ganancia (calculada
-- en el momento, con datos que sí estaban en memoria), y al recargar el
-- costo venía vacío y la gráfica pintaba lo cobrado. Todo "funcionando",
-- con el dato perdido en silencio.
--
-- Por eso esta migración junta los `add column if not exists` de TODAS las
-- migraciones anteriores en un solo lugar. No hay que saber cuáles se
-- corrieron y cuáles no: se corre esta y quedan las que falten, sin tocar
-- las que ya estén. Cubre este caso y cualquier otro hueco del mismo tipo
-- que haya quedado abierto.

alter table abarrotera_cortes add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotera_cortes add column if not exists empleado_nombre_cache text;
alter table abarrotera_cortes add column if not exists empleado_rol_cache text;
alter table abarrotera_cortes add column if not exists fondo_inicial numeric(10, 2);
alter table abarrotera_cortes add column if not exists revisado_at timestamptz;
alter table abarrotera_cortes add column if not exists revisado_nota text;
alter table abarrotes_apartados add column if not exists entregado boolean not null default false;
alter table abarrotes_fiados add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_fiados add column if not exists empleado_nombre_cache text;
alter table abarrotes_fiados add column if not exists empleado_rol_cache text;
alter table abarrotes_gastos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_gastos add column if not exists empleado_nombre_cache text;
alter table abarrotes_gastos add column if not exists empleado_rol_cache text;
alter table abarrotes_productos add column if not exists emoji text;
alter table abarrotes_productos add column if not exists is_volatile boolean not null default false;
alter table abarrotes_productos add column if not exists por_caducar boolean not null default false;
alter table abarrotes_productos add column if not exists unidad text not null default 'pieza';
alter table abarrotes_sale_items add column if not exists costo_unitario numeric(10, 2);
alter table abarrotes_ventas add column if not exists cancelada boolean not null default false;
alter table abarrotes_ventas add column if not exists cancelado_por text;
alter table abarrotes_ventas add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table abarrotes_ventas add column if not exists empleado_nombre_cache text;
alter table abarrotes_ventas add column if not exists empleado_rol_cache text;
alter table abarrotes_ventas add column if not exists motivo_cancelacion text;
alter table barberia_caja add column if not exists costo numeric(10, 2);
alter table barberia_caja add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table barberia_caja add column if not exists empleado_nombre_cache text;
alter table barberia_caja add column if not exists empleado_rol_cache text;
alter table barberia_citas add column if not exists cancelado_por text;
alter table barberia_citas add column if not exists cobrado_en timestamptz;
alter table barberia_citas add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table barberia_citas add column if not exists empleado_nombre_cache text;
alter table barberia_citas add column if not exists empleado_rol_cache text;
alter table barberia_citas add column if not exists motivo_cancelacion text;
alter table barberia_cortes   add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table barberia_cortes   add column if not exists empleado_nombre_cache text;
alter table barberia_cortes   add column if not exists revisado_at timestamptz;
alter table barberia_cortes   add column if not exists revisado_nota text;
alter table barberia_cortes  add column if not exists empleado_rol_cache text;
alter table barberia_cortes add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table barberia_cortes add column if not exists empleado_nombre_cache text;
alter table barberia_cortes add column if not exists fondo_inicial numeric(10, 2);
alter table barberia_cortes add column if not exists gastos numeric(10, 2);
alter table barberia_horario add column if not exists comida_fin time;
alter table barberia_horario add column if not exists comida_inicio time;
alter table barberia_productos add column if not exists costo numeric(10, 2);
alter table barberia_productos add column if not exists eliminar_en_cero boolean not null default false;
alter table barberia_productos add column if not exists precio numeric(10, 2);
alter table fonda_gastos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fonda_gastos add column if not exists empleado_nombre_cache text;
alter table fonda_gastos add column if not exists empleado_rol_cache text;
alter table fonda_pedido_items add column if not exists costo_unitario numeric default 0;
alter table fonda_pedido_items add column if not exists costo_unitario numeric(10, 2);
alter table fonda_pedido_items add column if not exists extra_concepto text;
alter table fonda_pedido_items add column if not exists extra_monto numeric(10, 2);
alter table fonda_pedido_items add column if not exists precio_unitario numeric default 0;
alter table fonda_pedido_items add column if not exists precio_unitario numeric(10, 2);
alter table fonda_pedido_items add column if not exists variante_nombre text;
alter table fonda_pedidos add column if not exists cancelado_por text;
alter table fonda_pedidos add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fonda_pedidos add column if not exists empleado_nombre_cache text;
alter table fonda_pedidos add column if not exists empleado_rol_cache text;
alter table fonda_pedidos add column if not exists fecha date not null default current_date;
alter table fonda_pedidos add column if not exists hora_entrega time;
alter table fonda_pedidos add column if not exists motivo_cancelacion text;
alter table fonda_pedidos add column if not exists turno_id uuid;
alter table fonda_platillos add column if not exists costo numeric(10, 2);
alter table fonda_platillos add column if not exists estado_merma text check (estado_merma in ('sobro_poco', 'sobro_mucho'));
alter table fondita_cortes    add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fondita_cortes    add column if not exists empleado_nombre_cache text;
alter table fondita_cortes    add column if not exists revisado_at timestamptz;
alter table fondita_cortes    add column if not exists revisado_nota text;
alter table fondita_cortes   add column if not exists empleado_rol_cache text;
alter table fondita_cortes add column if not exists diferencia numeric(10, 2);
alter table fondita_cortes add column if not exists empleado_id uuid references negocio_empleados(id) on delete set null;
alter table fondita_cortes add column if not exists empleado_nombre_cache text;
alter table fondita_cortes add column if not exists fondo_inicial numeric(10, 2);
alter table negocios add column if not exists accepted_terms_at timestamptz;
alter table negocios add column if not exists app_slug text not null default 'fuera-libreta';
alter table negocios add column if not exists dias_recordatorio integer not null default 28;
alter table negocios add column if not exists telefono_contacto text;
alter table negocios add column if not exists timezone text;
alter table negocios add column if not exists turno_cerrado_en timestamptz;
alter table negocios add column if not exists turno_fonda_cerrado_en timestamptz;
alter table negocios add column if not exists ultimo_pago_at timestamptz;
alter table negocios add column if not exists whatsapp text;
alter table personal_habito_registro add column if not exists avance numeric;
alter table personal_habitos add column if not exists fuente text not null default 'manual';
alter table personal_habitos add column if not exists meta_valor numeric;
alter table personal_habitos add column if not exists unidad text;
alter table personal_habitos add column if not exists visual text not null default 'anillo';
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists created_at timestamptz not null default now();
alter table profiles add column if not exists email text;
alter table profiles add column if not exists is_banned boolean not null default false;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists plan text not null default 'free';
alter table profiles add column if not exists role text not null default 'user';
alter table profiles add column if not exists telefono text;

notify pgrst, 'reload schema';
