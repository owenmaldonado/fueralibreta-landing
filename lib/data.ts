import { supabase } from "./supabase";
import type {
  Business,
  TenantData,
  BarberiaData,
  FondaData,
  AbarrotesData,
  BarberService,
  HorarioDia,
  Excepcion,
  BarberClient,
  Appointment,
  CajaEntry,
  InventoryProduct,
  Dish,
  FondaOrder,
  OrderItem,
  Expense,
  GroceryProduct,
  GrocerySale,
  GrocerySaleItem,
  Fiado,
  Apartado,
} from "./types";

// ============================================================================
// Capa de datos: Supabase en vez de localStorage.
//
// - fetchNegocioByOwner / fetchTenantData: leer el negocio del dueño logueado
// - fetchNegocioBySlug: leer un negocio público (para /b/[slug])
// - persistTenant: insertar un negocio + todo su contenido inicial de una vez
//   (onboarding nuevo, o activar una demo local)
// - syncTenantDiff: comparar el estado anterior vs el nuevo de useSession().update()
//   y aplicar los inserts/updates/deletes necesarios en Supabase
// ============================================================================

type Row = Record<string, unknown>;

// ---------- negocios ----------

function businessFromRow(row: Row): Business {
  return {
    id: row.id as string,
    ownerId: (row.owner_id as string) ?? undefined,
    slug: row.slug as string,
    nombre: row.nombre as string,
    tipo: row.tipo as Business["tipo"],
    dueno: row.dueno as string,
    telefono: row.telefono as string,
    direccion: (row.direccion as string) ?? undefined,
    is_active: row.is_active as boolean,
    trial_fin: row.trial_fin as string,
    created_at: row.created_at as string,
    demo: (row.demo as boolean) ?? false,
  };
}

function businessToRow(b: Business): Row {
  return {
    id: b.id,
    owner_id: b.ownerId ?? null,
    slug: b.slug,
    nombre: b.nombre,
    tipo: b.tipo,
    dueno: b.dueno,
    telefono: b.telefono,
    direccion: b.direccion ?? null,
    is_active: b.is_active,
    trial_fin: b.trial_fin,
    demo: b.demo ?? false,
  };
}

export async function fetchNegocioByOwner(ownerId: string): Promise<Business | null> {
  const { data, error } = await supabase.from("negocios").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  return data ? businessFromRow(data) : null;
}

/** Solo negocios activos (RLS público también lo exige). Usado por /b/[slug]. */
export async function fetchNegocioBySlug(slug: string): Promise<Business | null> {
  const { data, error } = await supabase.from("negocios").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (error) throw error;
  return data ? businessFromRow(data) : null;
}

async function mustInsert(table: string, rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
}

// ---------- barbería: mapeos ----------

const servicioFromRow = (r: Row): BarberService => ({
  id: r.id as string,
  nombre: r.nombre as string,
  precio: Number(r.precio),
  duracion_min: r.duracion_min as number,
});
const servicioToRow = (s: BarberService, negocioId: string): Row => ({
  id: s.id,
  negocio_id: negocioId,
  nombre: s.nombre,
  precio: s.precio,
  duracion_min: s.duracion_min,
});

const horarioFromRow = (r: Row): HorarioDia => ({
  dia: r.dia as HorarioDia["dia"],
  abierto: r.abierto as boolean,
  inicio: (r.inicio as string).slice(0, 5),
  fin: (r.fin as string).slice(0, 5),
});
const horarioToRow = (h: HorarioDia, negocioId: string): Row => ({
  negocio_id: negocioId,
  dia: h.dia,
  abierto: h.abierto,
  inicio: h.inicio,
  fin: h.fin,
});

const excepcionFromRow = (r: Row): Excepcion => ({
  id: r.id as string,
  fecha: r.fecha as string,
  etiqueta: r.etiqueta as string,
  cerrado: r.cerrado as boolean,
  horaEspecialFin: r.hora_especial_fin ? (r.hora_especial_fin as string).slice(0, 5) : undefined,
});
const excepcionToRow = (e: Excepcion, negocioId: string): Row => ({
  id: e.id,
  negocio_id: negocioId,
  fecha: e.fecha,
  etiqueta: e.etiqueta,
  cerrado: e.cerrado,
  hora_especial_fin: e.horaEspecialFin ?? null,
});

const clienteFromRow = (r: Row): BarberClient => ({
  id: r.id as string,
  nombre: r.nombre as string,
  telefono: r.telefono as string,
  ultimaVisita: (r.ultima_visita as string) ?? null,
  visitas: r.visitas as number,
  notas: (r.notas as string) ?? undefined,
  cumpleanos: (r.cumpleanos as string) ?? undefined,
});
const clienteToRow = (c: BarberClient, negocioId: string): Row => ({
  id: c.id,
  negocio_id: negocioId,
  nombre: c.nombre,
  telefono: c.telefono,
  ultima_visita: c.ultimaVisita ?? null,
  visitas: c.visitas,
  notas: c.notas ?? null,
  cumpleanos: c.cumpleanos ?? null,
});

const citaFromRow = (r: Row): Appointment => ({
  id: r.id as string,
  clienteId: (r.cliente_id as string) ?? "",
  clienteNombre: r.cliente_nombre as string,
  clienteTelefono: (r.cliente_telefono as string) ?? "",
  servicioId: (r.servicio_id as string) ?? "",
  servicioNombre: r.servicio_nombre as string,
  precio: Number(r.precio),
  fecha: r.fecha as string,
  hora: (r.hora as string).slice(0, 5),
  estado: r.estado as Appointment["estado"],
});
const citaToRow = (c: Appointment, negocioId: string): Row => ({
  id: c.id,
  negocio_id: negocioId,
  cliente_id: c.clienteId || null,
  cliente_nombre: c.clienteNombre,
  cliente_telefono: c.clienteTelefono,
  servicio_id: c.servicioId || null,
  servicio_nombre: c.servicioNombre,
  precio: c.precio,
  fecha: c.fecha,
  hora: c.hora,
  estado: c.estado,
});

const cajaFromRow = (r: Row): CajaEntry => ({
  id: r.id as string,
  tipo: r.tipo as CajaEntry["tipo"],
  concepto: r.concepto as string,
  monto: Number(r.monto),
  metodo: r.metodo as CajaEntry["metodo"],
  fecha: r.fecha as string,
});
const cajaToRow = (c: CajaEntry, negocioId: string): Row => ({
  id: c.id,
  negocio_id: negocioId,
  tipo: c.tipo,
  concepto: c.concepto,
  monto: c.monto,
  metodo: c.metodo,
  fecha: c.fecha,
});

const productoBarberiaFromRow = (r: Row): InventoryProduct => ({
  id: r.id as string,
  nombre: r.nombre as string,
  stock: r.stock as number,
  minimo: r.minimo as number,
});
const productoBarberiaToRow = (p: InventoryProduct, negocioId: string): Row => ({
  id: p.id,
  negocio_id: negocioId,
  nombre: p.nombre,
  stock: p.stock,
  minimo: p.minimo,
});

async function fetchBarberiaData(negocioId: string): Promise<BarberiaData> {
  const [servicios, horario, excepciones, clientes, citas, caja, productos] = await Promise.all([
    supabase.from("barberia_servicios").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_horario").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_excepciones").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_clientes").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_citas").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_caja").select("*").eq("negocio_id", negocioId).order("fecha", { ascending: false }),
    supabase.from("barberia_productos").select("*").eq("negocio_id", negocioId),
  ]);
  for (const r of [servicios, horario, excepciones, clientes, citas, caja, productos]) {
    if (r.error) throw r.error;
  }
  return {
    servicios: (servicios.data ?? []).map(servicioFromRow),
    horario: (horario.data ?? []).map(horarioFromRow),
    excepciones: (excepciones.data ?? []).map(excepcionFromRow),
    clientes: (clientes.data ?? []).map(clienteFromRow),
    citas: (citas.data ?? []).map(citaFromRow),
    caja: (caja.data ?? []).map(cajaFromRow),
    productos: (productos.data ?? []).map(productoBarberiaFromRow),
  };
}

// ---------- fonda: mapeos ----------

const platilloFromRow = (r: Row): Dish => ({
  id: r.id as string,
  nombre: r.nombre as string,
  precio: Number(r.precio),
  categoria: r.categoria as string,
  activoHoy: r.activo_hoy as boolean,
});
const platilloToRow = (p: Dish, negocioId: string): Row => ({
  id: p.id,
  negocio_id: negocioId,
  nombre: p.nombre,
  precio: p.precio,
  categoria: p.categoria,
  activo_hoy: p.activoHoy,
});

const pedidoToRow = (p: FondaOrder, negocioId: string): Row => ({
  id: p.id,
  negocio_id: negocioId,
  cliente_nombre: p.clienteNombre,
  cliente_telefono: p.clienteTelefono ?? null,
  hora: p.hora,
  estado: p.estado,
  total: p.total,
});
const itemToRow = (it: OrderItem, pedidoId: string): Row => ({
  pedido_id: pedidoId,
  platillo_id: it.platilloId || null,
  platillo_nombre: it.platilloNombre,
  cantidad: it.cantidad,
  nota: it.nota ?? null,
});

const gastoFromRow = (r: Row): Expense => ({
  id: r.id as string,
  categoria: r.categoria as string,
  monto: Number(r.monto),
  fecha: r.fecha as string,
  recordatorio: (r.recordatorio as boolean) ?? false,
});
const gastoToRow = (g: Expense, negocioId: string): Row => ({
  id: g.id,
  negocio_id: negocioId,
  categoria: g.categoria,
  monto: g.monto,
  fecha: g.fecha,
  recordatorio: g.recordatorio ?? false,
});

async function fetchFondaData(negocioId: string): Promise<FondaData> {
  const [platillosRes, pedidosRes, gastosRes] = await Promise.all([
    supabase.from("fonda_platillos").select("*").eq("negocio_id", negocioId),
    supabase.from("fonda_pedidos").select("*").eq("negocio_id", negocioId).order("created_at", { ascending: false }),
    supabase.from("fonda_gastos").select("*").eq("negocio_id", negocioId),
  ]);
  for (const r of [platillosRes, pedidosRes, gastosRes]) {
    if (r.error) throw r.error;
  }

  const pedidoIds = (pedidosRes.data ?? []).map((p) => p.id as string);
  let itemsData: Row[] = [];
  if (pedidoIds.length) {
    const itemsRes = await supabase.from("fonda_pedido_items").select("*").in("pedido_id", pedidoIds);
    if (itemsRes.error) throw itemsRes.error;
    itemsData = itemsRes.data ?? [];
  }

  const pedidos: FondaOrder[] = (pedidosRes.data ?? []).map((row) => ({
    id: row.id as string,
    clienteNombre: row.cliente_nombre as string,
    clienteTelefono: (row.cliente_telefono as string) ?? undefined,
    hora: (row.hora as string).slice(0, 5),
    estado: row.estado as FondaOrder["estado"],
    total: Number(row.total),
    items: itemsData
      .filter((it) => it.pedido_id === row.id)
      .map((it) => ({
        id: it.id as string,
        platilloId: (it.platillo_id as string) ?? "",
        platilloNombre: it.platillo_nombre as string,
        cantidad: it.cantidad as number,
        nota: (it.nota as string) ?? undefined,
      })),
  }));

  return {
    platillos: (platillosRes.data ?? []).map(platilloFromRow),
    pedidos,
    gastos: (gastosRes.data ?? []).map(gastoFromRow),
  };
}

// ---------- abarrotes: mapeos ----------

const productoAbarrotesToRow = (p: GroceryProduct, negocioId: string): Row => ({
  id: p.id,
  negocio_id: negocioId,
  nombre: p.nombre,
  codigo: p.codigo,
  categoria: p.categoria,
  costo: p.costo,
  precio: p.precio,
  stock: p.stock,
  minimo: p.minimo,
  control_caducidad: p.controlCaducidad,
  unidad: p.unidad,
});
const loteToRow = (l: { cantidad: number; fecha: string }, productoId: string): Row => ({
  producto_id: productoId,
  cantidad: l.cantidad,
  fecha_caducidad: l.fecha,
});

const ventaToRow = (v: GrocerySale, negocioId: string): Row => ({
  id: v.id,
  negocio_id: negocioId,
  total: v.total,
  fecha: v.fecha,
});
const ventaItemToRow = (it: GrocerySaleItem, ventaId: string): Row => ({
  venta_id: ventaId,
  producto_id: it.productoId || null,
  producto_nombre: it.productoNombre,
  cantidad: it.cantidad,
  precio_unitario: it.precioUnitario,
  subtotal: it.subtotal,
});

const fiadoToRow = (f: Fiado, negocioId: string): Row => ({
  id: f.id,
  negocio_id: negocioId,
  cliente_nombre: f.clienteNombre,
  telefono: f.telefono,
  saldo: f.saldo,
});
const movimientoToRow = (m: { fecha: string; monto: number; tipo: string }, fiadoId: string): Row => ({
  fiado_id: fiadoId,
  fecha: m.fecha,
  monto: m.monto,
  tipo: m.tipo,
});

const apartadoFromRow = (r: Row): Apartado => ({
  id: r.id as string,
  clienteNombre: r.cliente_nombre as string,
  telefono: r.telefono as string,
  producto: r.producto as string,
  total: Number(r.total),
  abonado: Number(r.abonado),
  fechaLimite: r.fecha_limite as string,
  entregado: (r.entregado as boolean) ?? false,
});
const apartadoToRow = (a: Apartado, negocioId: string): Row => ({
  id: a.id,
  negocio_id: negocioId,
  cliente_nombre: a.clienteNombre,
  telefono: a.telefono,
  producto: a.producto,
  total: a.total,
  abonado: a.abonado,
  fecha_limite: a.fechaLimite,
  entregado: a.entregado,
});

async function fetchAbarrotesData(negocioId: string): Promise<AbarrotesData> {
  const [productosRes, ventasRes, fiadosRes, apartadosRes, gastosRes] = await Promise.all([
    supabase.from("abarrotes_productos").select("*").eq("negocio_id", negocioId),
    supabase.from("abarrotes_ventas").select("*").eq("negocio_id", negocioId).order("fecha", { ascending: false }),
    supabase.from("abarrotes_fiados").select("*").eq("negocio_id", negocioId),
    supabase.from("abarrotes_apartados").select("*").eq("negocio_id", negocioId),
    supabase.from("abarrotes_gastos").select("*").eq("negocio_id", negocioId),
  ]);
  for (const r of [productosRes, ventasRes, fiadosRes, apartadosRes, gastosRes]) {
    if (r.error) throw r.error;
  }

  const productoIds = (productosRes.data ?? []).map((p) => p.id as string);
  let lotesData: Row[] = [];
  if (productoIds.length) {
    const lotesRes = await supabase.from("abarrotes_lotes").select("*").in("producto_id", productoIds);
    if (lotesRes.error) throw lotesRes.error;
    lotesData = lotesRes.data ?? [];
  }

  const fiadoIds = (fiadosRes.data ?? []).map((f) => f.id as string);
  let movimientosData: Row[] = [];
  if (fiadoIds.length) {
    const movRes = await supabase.from("abarrotes_fiado_movimientos").select("*").in("fiado_id", fiadoIds).order("fecha", { ascending: false });
    if (movRes.error) throw movRes.error;
    movimientosData = movRes.data ?? [];
  }

  const ventaIds = (ventasRes.data ?? []).map((v) => v.id as string);
  let saleItemsData: Row[] = [];
  if (ventaIds.length) {
    const itemsRes = await supabase.from("abarrotes_sale_items").select("*").in("venta_id", ventaIds);
    if (itemsRes.error) throw itemsRes.error;
    saleItemsData = itemsRes.data ?? [];
  }

  const productos: GroceryProduct[] = (productosRes.data ?? []).map((row) => ({
    id: row.id as string,
    nombre: row.nombre as string,
    codigo: row.codigo as string,
    categoria: row.categoria as string,
    costo: Number(row.costo),
    precio: Number(row.precio),
    stock: row.stock as number,
    minimo: row.minimo as number,
    controlCaducidad: row.control_caducidad as boolean,
    unidad: ((row.unidad as string) ?? "pieza") as GroceryProduct["unidad"],
    lotes: lotesData
      .filter((l) => l.producto_id === row.id)
      .map((l) => ({ cantidad: l.cantidad as number, fecha: l.fecha_caducidad as string })),
  }));

  const fiados: Fiado[] = (fiadosRes.data ?? []).map((row) => ({
    id: row.id as string,
    clienteNombre: row.cliente_nombre as string,
    telefono: row.telefono as string,
    saldo: Number(row.saldo),
    historial: movimientosData
      .filter((m) => m.fiado_id === row.id)
      .map((m) => ({ fecha: m.fecha as string, monto: Number(m.monto), tipo: m.tipo as "cargo" | "abono" })),
  }));

  const ventas: GrocerySale[] = (ventasRes.data ?? []).map((row) => ({
    id: row.id as string,
    total: Number(row.total),
    fecha: row.fecha as string,
    items: saleItemsData
      .filter((it) => it.venta_id === row.id)
      .map((it) => ({
        id: it.id as string,
        productoId: (it.producto_id as string) ?? "",
        productoNombre: it.producto_nombre as string,
        cantidad: it.cantidad as number,
        precioUnitario: Number(it.precio_unitario),
        subtotal: Number(it.subtotal),
      })),
  }));

  return {
    productos,
    ventas,
    fiados,
    apartados: (apartadosRes.data ?? []).map(apartadoFromRow),
    gastos: (gastosRes.data ?? []).map(gastoFromRow),
  };
}

// ---------- API pública ----------

export async function fetchTenantData(business: Business): Promise<TenantData> {
  if (business.tipo === "barberia") return { business, barberia: await fetchBarberiaData(business.id) };
  if (business.tipo === "fonda") return { business, fonda: await fetchFondaData(business.id) };
  return { business, abarrotes: await fetchAbarrotesData(business.id) };
}

/** Inserta un negocio nuevo con todo su contenido inicial (onboarding o activar demo). */
export async function persistTenant(tenant: TenantData, ownerId: string): Promise<void> {
  const business: Business = { ...tenant.business, ownerId };
  const { error } = await supabase.from("negocios").insert(businessToRow(business));
  if (error) throw error;

  const negocioId = business.id;

  if (tenant.barberia) {
    const b = tenant.barberia;
    await mustInsert("barberia_servicios", b.servicios.map((s) => servicioToRow(s, negocioId)));
    await mustInsert("barberia_horario", b.horario.map((h) => horarioToRow(h, negocioId)));
    await mustInsert("barberia_excepciones", b.excepciones.map((e) => excepcionToRow(e, negocioId)));
    await mustInsert("barberia_productos", b.productos.map((p) => productoBarberiaToRow(p, negocioId)));
    await mustInsert("barberia_clientes", b.clientes.map((c) => clienteToRow(c, negocioId)));
    await mustInsert("barberia_citas", b.citas.map((c) => citaToRow(c, negocioId)));
    await mustInsert("barberia_caja", b.caja.map((c) => cajaToRow(c, negocioId)));
  }

  if (tenant.fonda) {
    const f = tenant.fonda;
    await mustInsert("fonda_platillos", f.platillos.map((p) => platilloToRow(p, negocioId)));
    await mustInsert("fonda_pedidos", f.pedidos.map((p) => pedidoToRow(p, negocioId)));
    await mustInsert(
      "fonda_pedido_items",
      f.pedidos.flatMap((p) => p.items.map((it) => itemToRow(it, p.id)))
    );
    await mustInsert("fonda_gastos", f.gastos.map((g) => gastoToRow(g, negocioId)));
  }

  if (tenant.abarrotes) {
    const a = tenant.abarrotes;
    await mustInsert("abarrotes_productos", a.productos.map((p) => productoAbarrotesToRow(p, negocioId)));
    await mustInsert(
      "abarrotes_lotes",
      a.productos.flatMap((p) => (p.lotes ?? []).map((l) => loteToRow(l, p.id)))
    );
    await mustInsert("abarrotes_ventas", a.ventas.map((v) => ventaToRow(v, negocioId)));
    await mustInsert(
      "abarrotes_sale_items",
      a.ventas.flatMap((v) => v.items.map((it) => ventaItemToRow(it, v.id)))
    );
    await mustInsert("abarrotes_fiados", a.fiados.map((f) => fiadoToRow(f, negocioId)));
    await mustInsert(
      "abarrotes_fiado_movimientos",
      a.fiados.flatMap((f) => f.historial.map((m) => movimientoToRow(m, f.id)))
    );
    await mustInsert("abarrotes_apartados", a.apartados.map((x) => apartadoToRow(x, negocioId)));
    await mustInsert("abarrotes_gastos", a.gastos.map((g) => gastoToRow(g, negocioId)));
  }
}

// ---------- diff-sync (usado por useSession().update) ----------

async function diffAndSync<T extends { id: string }>(
  table: string,
  prevArr: T[],
  nextArr: T[],
  toRow: (item: T) => Row
): Promise<void> {
  const prevMap = new Map(prevArr.map((i) => [i.id, i] as const));
  const nextMap = new Map(nextArr.map((i) => [i.id, i] as const));

  const inserts: Row[] = [];
  const updates: Row[] = [];
  const deletes: string[] = [];

  nextMap.forEach((item, id) => {
    const prevItem = prevMap.get(id);
    if (!prevItem) inserts.push(toRow(item));
    else if (JSON.stringify(prevItem) !== JSON.stringify(item)) updates.push(toRow(item));
  });
  prevMap.forEach((_item, id) => {
    if (!nextMap.has(id)) deletes.push(id);
  });

  if (inserts.length) {
    const { error } = await supabase.from(table).insert(inserts);
    if (error) throw error;
  }
  for (const row of updates) {
    const { error } = await supabase
      .from(table)
      .update(row)
      .eq("id", row.id as string);
    if (error) throw error;
  }
  if (deletes.length) {
    const { error } = await supabase.from(table).delete().in("id", deletes);
    if (error) throw error;
  }
}

async function syncHorario(negocioId: string, horario: HorarioDia[]): Promise<void> {
  const { error } = await supabase
    .from("barberia_horario")
    .upsert(
      horario.map((h) => horarioToRow(h, negocioId)),
      { onConflict: "negocio_id,dia" }
    );
  if (error) throw error;
}

/** Reemplaza por completo los lotes de un producto cuando el producto cambió. */
async function syncAbarrotesProductos(negocioId: string, prevArr: GroceryProduct[], nextArr: GroceryProduct[]): Promise<void> {
  await diffAndSync("abarrotes_productos", prevArr, nextArr, (p) => productoAbarrotesToRow(p, negocioId));

  const prevMap = new Map(prevArr.map((p) => [p.id, p]));
  for (const p of nextArr) {
    const prevP = prevMap.get(p.id);
    if (prevP && JSON.stringify(prevP) === JSON.stringify(p)) continue;
    await supabase.from("abarrotes_lotes").delete().eq("producto_id", p.id);
    await mustInsert(
      "abarrotes_lotes",
      (p.lotes ?? []).map((l) => loteToRow(l, p.id))
    );
  }
}

/** Reemplaza por completo el historial de un fiado cuando el fiado cambió. */
async function syncAbarrotesFiados(negocioId: string, prevArr: Fiado[], nextArr: Fiado[]): Promise<void> {
  await diffAndSync("abarrotes_fiados", prevArr, nextArr, (f) => fiadoToRow(f, negocioId));

  const prevMap = new Map(prevArr.map((f) => [f.id, f]));
  for (const f of nextArr) {
    const prevF = prevMap.get(f.id);
    if (prevF && JSON.stringify(prevF) === JSON.stringify(f)) continue;
    await supabase.from("abarrotes_fiado_movimientos").delete().eq("fiado_id", f.id);
    await mustInsert(
      "abarrotes_fiado_movimientos",
      f.historial.map((m) => movimientoToRow(m, f.id))
    );
  }
}

/** Reemplaza por completo los items de un pedido cuando el pedido cambió. */
async function syncFondaPedidos(negocioId: string, prevArr: FondaOrder[], nextArr: FondaOrder[]): Promise<void> {
  await diffAndSync("fonda_pedidos", prevArr, nextArr, (p) => pedidoToRow(p, negocioId));

  const prevMap = new Map(prevArr.map((p) => [p.id, p]));
  for (const p of nextArr) {
    const prevP = prevMap.get(p.id);
    if (prevP && JSON.stringify(prevP.items) === JSON.stringify(p.items)) continue;
    await supabase.from("fonda_pedido_items").delete().eq("pedido_id", p.id);
    await mustInsert(
      "fonda_pedido_items",
      p.items.map((it) => itemToRow(it, p.id))
    );
  }
}

/** Reemplaza por completo los items de una venta cuando la venta (el ticket) cambió. */
async function syncAbarrotesVentas(negocioId: string, prevArr: GrocerySale[], nextArr: GrocerySale[]): Promise<void> {
  await diffAndSync("abarrotes_ventas", prevArr, nextArr, (v) => ventaToRow(v, negocioId));

  const prevMap = new Map(prevArr.map((v) => [v.id, v]));
  for (const v of nextArr) {
    const prevV = prevMap.get(v.id);
    if (prevV && JSON.stringify(prevV.items) === JSON.stringify(v.items)) continue;
    await supabase.from("abarrotes_sale_items").delete().eq("venta_id", v.id);
    await mustInsert(
      "abarrotes_sale_items",
      v.items.map((it) => ventaItemToRow(it, v.id))
    );
  }
}

// ---------- reserva pública (/b/[slug]) ----------

export interface PublicBookingData {
  servicios: BarberService[];
  horario: HorarioDia[];
  excepciones: Excepcion[];
  citas: Pick<Appointment, "fecha" | "hora" | "estado">[];
}

/** Datos mínimos y públicos para calcular huecos disponibles, sin exponer clientes de otros. */
export async function fetchPublicBookingData(negocioId: string): Promise<PublicBookingData> {
  const [servicios, horario, excepciones, citas] = await Promise.all([
    supabase.from("barberia_servicios").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_horario").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_excepciones").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_citas_publicas").select("*").eq("negocio_id", negocioId),
  ]);
  for (const r of [servicios, horario, excepciones, citas]) {
    if (r.error) throw r.error;
  }
  return {
    servicios: (servicios.data ?? []).map(servicioFromRow),
    horario: (horario.data ?? []).map(horarioFromRow),
    excepciones: (excepciones.data ?? []).map(excepcionFromRow),
    citas: (citas.data ?? []).map((r) => ({
      fecha: r.fecha as string,
      hora: (r.hora as string).slice(0, 5),
      estado: r.estado as Appointment["estado"],
    })),
  };
}

/** Cliente público reservando desde /b/[slug]. RLS solo permite estado='pendiente'. */
export async function insertPublicCita(negocioId: string, cita: Omit<Appointment, "id">): Promise<void> {
  const { error } = await supabase.from("barberia_citas").insert(citaToRow({ ...cita, id: crypto.randomUUID() }, negocioId));
  if (error) throw error;
}

/** Compara el estado anterior y el nuevo de la sesión y aplica los cambios en Supabase. */
export async function syncTenantDiff(prev: TenantData, next: TenantData): Promise<void> {
  const negocioId = next.business.id;

  if (prev.barberia && next.barberia) {
    const p = prev.barberia;
    const n = next.barberia;
    await diffAndSync("barberia_servicios", p.servicios, n.servicios, (s) => servicioToRow(s, negocioId));
    await syncHorario(negocioId, n.horario);
    await diffAndSync("barberia_excepciones", p.excepciones, n.excepciones, (e) => excepcionToRow(e, negocioId));
    await diffAndSync("barberia_productos", p.productos, n.productos, (x) => productoBarberiaToRow(x, negocioId));
    // clientes antes que citas: una cita nueva puede referenciar un cliente nuevo del mismo update()
    await diffAndSync("barberia_clientes", p.clientes, n.clientes, (c) => clienteToRow(c, negocioId));
    await diffAndSync("barberia_citas", p.citas, n.citas, (c) => citaToRow(c, negocioId));
    await diffAndSync("barberia_caja", p.caja, n.caja, (c) => cajaToRow(c, negocioId));
  }

  if (prev.fonda && next.fonda) {
    const p = prev.fonda;
    const n = next.fonda;
    await diffAndSync("fonda_platillos", p.platillos, n.platillos, (x) => platilloToRow(x, negocioId));
    await syncFondaPedidos(negocioId, p.pedidos, n.pedidos);
    await diffAndSync("fonda_gastos", p.gastos, n.gastos, (g) => gastoToRow(g, negocioId));
  }

  if (prev.abarrotes && next.abarrotes) {
    const p = prev.abarrotes;
    const n = next.abarrotes;
    await syncAbarrotesProductos(negocioId, p.productos, n.productos);
    await syncAbarrotesVentas(negocioId, p.ventas, n.ventas);
    await syncAbarrotesFiados(negocioId, p.fiados, n.fiados);
    await diffAndSync("abarrotes_apartados", p.apartados, n.apartados, (x) => apartadoToRow(x, negocioId));
    await diffAndSync("abarrotes_gastos", p.gastos, n.gastos, (g) => gastoToRow(g, negocioId));
  }
}
