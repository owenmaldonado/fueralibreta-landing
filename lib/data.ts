import { supabase } from "./supabase";
import { normalizarPlan } from "./planes";
import { diaDeColumnaFecha } from "./chart-buckets";
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
  DishVariant,
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

/**
 * Alguien más apartó ese horario primero.
 *
 * La decide la base de datos, no la pantalla: el índice único
 * barberia_citas_slot_apartado_unico (migración 20260913000002) solo deja
 * UNA cita pendiente por negocio/fecha/hora, así que de dos personas
 * apartando el mismo hueco al mismo tiempo, la segunda choca aquí. Se
 * convierte en un error con nombre —en vez del "23505" crudo de Postgres—
 * para que quien esté guardando reciba un mensaje que explique QUÉ pasó y
 * pueda elegir otra hora, en lugar del aviso genérico de "no se pudo
 * guardar" que no dice nada.
 */
export class HorarioYaApartadoError extends Error {
  readonly fecha?: string;
  readonly hora?: string;
  constructor(fecha?: string, hora?: string) {
    super("Ese horario ya está apartado.");
    this.name = "HorarioYaApartadoError";
    this.fecha = fecha;
    this.hora = hora;
  }
}

/** 23505 = unique_violation. Se mira el nombre del índice para no confundir este choque con cualquier otro duplicado. */
export function esChoqueDeHorario(error: { code?: string; message?: string; details?: string } | null): boolean {
  if (!error || error.code !== "23505") return false;
  const texto = `${error.message ?? ""} ${error.details ?? ""}`;
  return texto.includes("barberia_citas_slot_apartado_unico");
}

// ---------- negocios ----------

export function businessFromRow(row: Row): Business {
  return {
    id: row.id as string,
    ownerId: (row.owner_id as string) ?? undefined,
    slug: row.slug as string,
    nombre: row.nombre as string,
    tipo: row.tipo as Business["tipo"],
    dueno: row.dueno as string,
    telefono: (row.telefono as string) ?? "",
    telefonoContacto: (row.telefono_contacto as string) ?? "",
    whatsapp: (row.whatsapp as string) ?? undefined,
    direccion: (row.direccion as string) ?? undefined,
    is_active: row.is_active as boolean,
    // La ficha pública por slug (fetchNegocioBySlug, más abajo) no devuelve
    // estas dos: son datos de la CUENTA, no de la vitrina, y a quien va a
    // agendar un corte no le importan. El `?? ""` es para esa fila
    // recortada — un negocio cargado con sesión propia sí las trae.
    trial_fin: (row.trial_fin as string) ?? "",
    created_at: (row.created_at as string) ?? "",
    demo: (row.demo as boolean) ?? false,
    appSlug: (row.app_slug as string) ?? "fuera-libreta",
    plan: normalizarPlan(row.plan as string | null | undefined),
    precioCustom: row.precio_custom != null ? Number(row.precio_custom) : null,
    esFundador: (row.es_fundador as boolean) ?? false,
    ultimoPagoAt: (row.ultimo_pago_at as string | null) ?? null,
    diasRecordatorio: row.dias_recordatorio != null ? Number(row.dias_recordatorio) : 28,
    acceptedTermsAt: (row.accepted_terms_at as string) ?? undefined,
    turnoFondaCerradoEn: (row.turno_fonda_cerrado_en as string | null) ?? null,
    // Cae a la columna vieja de fonda mientras la migración no haya
    // corrido en esa base — así el turno en curso no se pierde.
    turnoCerradoEn: ((row.turno_cerrado_en as string | null) ?? (row.turno_fonda_cerrado_en as string | null)) ?? null,
    timezone: (row.timezone as string) ?? undefined,
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
    telefono_contacto: b.telefonoContacto || null,
    whatsapp: b.whatsapp ?? null,
    direccion: b.direccion ?? null,
    is_active: b.is_active,
    trial_fin: b.trial_fin,
    demo: b.demo ?? false,
    app_slug: b.appSlug,
    accepted_terms_at: b.acceptedTermsAt ?? null,
    timezone: b.timezone ?? null,
  };
}

/**
 * El negocio del dueño logueado, DENTRO de esta app (fuera-libreta). Un
 * mismo owner_id podría algún día tener negocios en otras apps del hub de
 * super admin (mis_apps) — este repo genera y solo debe ver los suyos.
 */
export async function fetchNegocioByOwner(ownerId: string): Promise<Business | null> {
  // .maybeSingle() truena ("multiple rows returned") si este owner terminó
  // con más de un negocio — pudo pasar con la carrera que ya se arregló en
  // lib/session.ts, y esos usuarios existentes NO deben volver a ver el
  // formulario de alta solo porque quedó una fila duplicada. order+limit(1)
  // toma la más antigua (la real) sin tronar aunque haya duplicados.
  const { data, error } = await supabase
    .from("negocios")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("app_slug", "fuera-libreta")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? businessFromRow(data[0]) : null;
}

/**
 * Ficha pública de UN negocio por slug — la que usa /b/[slug] (página de
 * reservas), sin sesión.
 *
 * Va por RPC y no por `.from("negocios")` a propósito. Leer la tabla directo
 * exigía una policy de "cualquiera puede ver los negocios activos", y con la
 * anon key (que viaja en el bundle, es pública por diseño) eso permitía
 * bajarse la lista COMPLETA de clientes con sus teléfonos, su plan y lo que
 * paga cada uno en una sola petición. La función recibe el slug y devuelve
 * solo campos de vitrina, así que no se puede enumerar ni sacar nada de
 * negocio — ver la migración 20260913000001.
 *
 * Los campos que la función no devuelve (plan, trial_fin, etc.) no le hacen
 * falta a esta pantalla; se rellenan con valores neutros para cumplir el
 * tipo Business.
 */
export async function fetchNegocioBySlug(slug: string): Promise<Business | null> {
  const { data, error } = await supabase.rpc("negocio_publico_por_slug", { p_slug: slug });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? businessFromRow(row as Row) : null;
}

/**
 * PGRST204 = PostgREST no encuentra esa columna en su schema cache — nos ha
 * pasado 3 veces con empleado_rol_cache/empleado_id en distintas tablas,
 * siempre porque una migración se quedó a medias contra el proyecto real
 * (este repo no corre `supabase db push` en CI, se pegan a mano en el SQL
 * Editor). El mensaje trae el nombre de la columna entre comillas simples:
 * "Could not find the 'empleado_rol_cache' column of 'abarrotes_fiados' in
 * the schema cache".
 */
function nombreColumnaFaltante(error: { code?: string; message?: string } | null): string | null {
  if (!error || error.code !== "PGRST204") return null;
  const m = /Could not find the '([^']+)' column/.exec(error.message ?? "");
  return m ? m[1] : null;
}

/**
 * Insert resiliente al drift de columnas descrito arriba: si Supabase
 * rechaza el insert por PGRST204, reintenta UNA vez sin esa columna en vez
 * de perder la fila completa (antes: un negocio_id + empleado_rol_cache
 * desincronizado tumbaba TODO el insert — la venta/cita/fiado que sí tenía
 * todo lo demás bien igual se perdía). Loguea la columna que faltó para que
 * quede evidencia de que hace falta correr una migración pendiente, pero no
 * bloquea guardar el resto de los datos. Cualquier otro error (RLS, columna
 * NOT NULL, tipo inválido, etc.) se propaga igual que antes.
 */
export async function cleanInsert(table: string, rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows);
  if (!error) return;

  // Choque de horario: no es un fallo de red ni de esquema, es "alguien te
  // ganó el lugar". Se sube como error con nombre para que la pantalla
  // pueda decir cuál horario y por qué, en vez del aviso genérico de "no se
  // pudo guardar". Ver HorarioYaApartadoError arriba.
  if (esChoqueDeHorario(error)) {
    const choque = rows.find((r) => r.fecha && r.hora);
    throw new HorarioYaApartadoError(choque?.fecha as string | undefined, choque?.hora as string | undefined);
  }

  const columna = nombreColumnaFaltante(error);
  if (!columna) {
    console.error(`cleanInsert: insert en "${table}" falló:`, error);
    throw error;
  }

  console.warn(
    `cleanInsert: "${table}" no tiene la columna "${columna}" en el schema cache de Supabase (falta correr/reasertar una migración) — reintentando el insert sin ese campo para no perder la fila.`
  );
  const rowsSinColumna = rows.map((r) => {
    const { [columna]: _omitida, ...resto } = r;
    return resto;
  });
  const { error: error2 } = await supabase.from(table).insert(rowsSinColumna);
  if (error2) {
    console.error(`cleanInsert: insert en "${table}" volvió a fallar sin "${columna}":`, error2);
    throw error2;
  }
}

/** Mismo blindaje que cleanInsert, para el lado update() de diffAndSync. */
async function cleanUpdate(table: string, row: Row): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update(row)
    .eq("id", row.id as string);
  if (!error) return;

  // Mover una cita a un horario que ya está apartado cae aquí, no en el
  // insert — mismo trato.
  if (esChoqueDeHorario(error)) {
    throw new HorarioYaApartadoError(row.fecha as string | undefined, row.hora as string | undefined);
  }

  const columna = nombreColumnaFaltante(error);
  if (!columna) {
    console.error(`cleanUpdate: update en "${table}" falló:`, error);
    throw error;
  }

  console.warn(
    `cleanUpdate: "${table}" no tiene la columna "${columna}" en el schema cache de Supabase — reintentando el update sin ese campo.`
  );
  const { [columna]: _omitida, ...resto } = row;
  const { error: error2 } = await supabase
    .from(table)
    .update(resto)
    .eq("id", row.id as string);
  if (error2) {
    console.error(`cleanUpdate: update en "${table}" volvió a fallar sin "${columna}":`, error2);
    throw error2;
  }
}

// persistTenant (alta inicial de un negocio completo) sigue llamando
// mustInsert por nombre en ~25 lugares — mismo comportamiento resiliente,
// solo el nombre histórico.
const mustInsert = cleanInsert;

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
  comidaInicio: r.comida_inicio ? (r.comida_inicio as string).slice(0, 5) : undefined,
  comidaFin: r.comida_fin ? (r.comida_fin as string).slice(0, 5) : undefined,
});
const horarioToRow = (h: HorarioDia, negocioId: string): Row => ({
  negocio_id: negocioId,
  dia: h.dia,
  abierto: h.abierto,
  inicio: h.inicio,
  fin: h.fin,
  comida_inicio: h.comidaInicio || null,
  comida_fin: h.comidaFin || null,
});

const excepcionFromRow = (r: Row): Excepcion => ({
  id: r.id as string,
  fecha: diaDeColumnaFecha(r.fecha),
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

export const clienteFromRow = (r: Row): BarberClient => ({
  id: r.id as string,
  nombre: r.nombre as string,
  telefono: r.telefono as string,
  ultimaVisita: (r.ultima_visita as string) ?? null,
  visitas: r.visitas as number,
  notas: (r.notas as string) ?? undefined,
});
const clienteToRow = (c: BarberClient, negocioId: string): Row => ({
  id: c.id,
  negocio_id: negocioId,
  nombre: c.nombre,
  telefono: c.telefono,
  ultima_visita: c.ultimaVisita ?? null,
  visitas: c.visitas,
  notas: c.notas ?? null,
});

export const citaFromRow = (r: Row): Appointment => ({
  id: r.id as string,
  clienteId: (r.cliente_id as string) ?? "",
  clienteNombre: r.cliente_nombre as string,
  clienteTelefono: (r.cliente_telefono as string) ?? "",
  servicioId: (r.servicio_id as string) ?? "",
  servicioNombre: r.servicio_nombre as string,
  precio: Number(r.precio),
  fecha: diaDeColumnaFecha(r.fecha),
  hora: (r.hora as string).slice(0, 5),
  estado: r.estado as Appointment["estado"],
  metodo: (r.metodo as Appointment["metodo"]) ?? undefined,
  cobradoEn: (r.cobrado_en as string | null) ?? null,
  empleadoId: (r.empleado_id as string) ?? undefined,
  empleadoNombreCache: (r.empleado_nombre_cache as string) ?? undefined,
  empleadoRolCache: (r.empleado_rol_cache as Appointment["empleadoRolCache"]) ?? undefined,
  canceladoPor: (r.cancelado_por as string) ?? undefined,
  motivoCancelacion: (r.motivo_cancelacion as string) ?? undefined,
});

/**
 * Refetch ligero de solo barberia_citas — lo usa el fallback de polling de
 * lib/session.ts (escucharCitasEnVivo): si el canal de realtime se queda
 * "SUBSCRIBED" pero deja de entregar postgres_changes (RLS/token de
 * Realtime desincronizado, sin ningún error visible en consola), esto
 * vuelve a traer las citas del negocio cada cierto tiempo como red de
 * seguridad, sin esperar a que el dueño refresque la página a mano.
 */
export async function fetchCitasDeNegocio(negocioId: string): Promise<Appointment[]> {
  const { data, error } = await supabase.from("barberia_citas").select("*").eq("negocio_id", negocioId);
  if (error) throw error;
  return (data ?? []).map(citaFromRow);
}

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
  metodo: c.metodo ?? null,
  cobrado_en: c.cobradoEn ?? null,
  empleado_id: c.empleadoId ?? null,
  empleado_nombre_cache: c.empleadoNombreCache ?? null,
  empleado_rol_cache: c.empleadoRolCache ?? null,
  cancelado_por: c.canceladoPor ?? null,
  motivo_cancelacion: c.motivoCancelacion ?? null,
});

export const cajaFromRow = (r: Row): CajaEntry => ({
  id: r.id as string,
  tipo: r.tipo as CajaEntry["tipo"],
  concepto: r.concepto as string,
  monto: Number(r.monto),
  metodo: r.metodo as CajaEntry["metodo"],
  // timestamptz de verdad (el momento del movimiento), NO un día: se deja
  // completo y quien lo pinte lo convierte con fechaCalendarioLocal().
  fecha: r.fecha as string,
  costo: r.costo == null ? undefined : Number(r.costo),
  empleadoId: (r.empleado_id as string) ?? undefined,
  empleadoNombreCache: (r.empleado_nombre_cache as string) ?? undefined,
  empleadoRolCache: (r.empleado_rol_cache as CajaEntry["empleadoRolCache"]) ?? undefined,
});
const cajaToRow = (c: CajaEntry, negocioId: string): Row => ({
  id: c.id,
  negocio_id: negocioId,
  tipo: c.tipo,
  concepto: c.concepto,
  monto: c.monto,
  metodo: c.metodo,
  fecha: c.fecha,
  costo: c.costo ?? null,
  empleado_id: c.empleadoId ?? null,
  empleado_nombre_cache: c.empleadoNombreCache ?? null,
  empleado_rol_cache: c.empleadoRolCache ?? null,
});

/**
 * Mismo criterio que insertGastoDirecto/updateGastoDirecto/
 * deleteGastoDirecto (fonda/abarrotes) pero para barberia_caja — ahí un
 * "gasto" es un CajaEntry con tipo="gasto", no una tabla aparte. Solo
 * CajaForm lo usa, y solo para tipo==="gasto" (ventas/propinas de Caja
 * siguen por el camino optimista de siempre — no es lo que se reportó
 * perdiendo datos).
 */
export async function insertCajaEntryDirecto(negocioId: string, entry: CajaEntry): Promise<void> {
  const { error } = await supabase.from("barberia_caja").insert(cajaToRow(entry, negocioId));
  if (error) {
    console.error("[caja] INSERT a barberia_caja falló — el movimiento NO se guardó:", error);
    throw error;
  }
}

export async function updateCajaEntryDirecto(negocioId: string, entry: CajaEntry): Promise<void> {
  const { error } = await supabase.from("barberia_caja").update(cajaToRow(entry, negocioId)).eq("id", entry.id);
  if (error) {
    console.error("[caja] UPDATE a barberia_caja falló — el cambio NO se guardó:", error);
    throw error;
  }
}

export async function deleteCajaEntryDirecto(entryId: string): Promise<void> {
  const { error } = await supabase.from("barberia_caja").delete().eq("id", entryId);
  if (error) {
    console.error("[caja] DELETE en barberia_caja falló — el movimiento sigue existiendo:", error);
    throw error;
  }
}

const productoBarberiaFromRow = (r: Row): InventoryProduct => ({
  id: r.id as string,
  nombre: r.nombre as string,
  stock: r.stock as number,
  minimo: r.minimo as number,
  eliminarEnCero: (r.eliminar_en_cero as boolean) ?? false,
  precio: r.precio == null ? undefined : Number(r.precio),
  costo: r.costo == null ? undefined : Number(r.costo),
});
const productoBarberiaToRow = (p: InventoryProduct, negocioId: string): Row => ({
  id: p.id,
  negocio_id: negocioId,
  nombre: p.nombre,
  stock: p.stock,
  minimo: p.minimo,
  eliminar_en_cero: p.eliminarEnCero ?? false,
  precio: p.precio ?? null,
  costo: p.costo ?? null,
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
  // TEMPORAL: logueado por tabla (no solo el primer error genérico) para
  // diagnosticar el círculo infinito en cuentas nuevas de barbería.
  const tablas = [
    ["barberia_servicios", servicios],
    ["barberia_horario", horario],
    ["barberia_excepciones", excepciones],
    ["barberia_clientes", clientes],
    ["barberia_citas", citas],
    ["barberia_caja", caja],
    ["barberia_productos", productos],
  ] as const;
  for (const [tabla, r] of tablas) {
    if (r.error) {
      console.error(`[session] fetchBarberiaData: "${tabla}" falló`, r.error);
      throw r.error;
    }
    console.log(`[session] fetchBarberiaData: "${tabla}" ok, ${r.data?.length ?? 0} filas`);
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
  costo: r.costo != null ? Number(r.costo) : undefined,
  estadoMerma: (r.estado_merma as Dish["estadoMerma"]) ?? undefined,
});
const platilloToRow = (p: Dish, negocioId: string): Row => ({
  id: p.id,
  negocio_id: negocioId,
  nombre: p.nombre,
  precio: p.precio,
  categoria: p.categoria,
  activo_hoy: p.activoHoy,
  costo: p.costo ?? null,
  estado_merma: p.estadoMerma ?? null,
});

const varianteFromRow = (r: Row): DishVariant => ({
  id: r.id as string,
  tipo: r.tipo as string,
  valor: r.valor as string,
  precioExtra: Number(r.precio_extra),
  disponible: r.disponible as boolean,
});
const varianteToRow = (v: DishVariant, productoId: string): Row => ({
  id: v.id,
  producto_id: productoId,
  tipo: v.tipo,
  valor: v.valor,
  precio_extra: v.precioExtra,
  disponible: v.disponible,
});

const pedidoToRow = (p: FondaOrder, negocioId: string): Row => ({
  id: p.id,
  negocio_id: negocioId,
  cliente_nombre: p.clienteNombre,
  cliente_telefono: p.clienteTelefono ?? null,
  fecha: p.fecha,
  hora: p.hora,
  hora_entrega: p.horaEntrega ?? null,
  estado: p.estado,
  total: p.total,
  empleado_id: p.empleadoId ?? null,
  empleado_nombre_cache: p.empleadoNombreCache ?? null,
  empleado_rol_cache: p.empleadoRolCache ?? null,
  cancelado_por: p.canceladoPor ?? null,
  motivo_cancelacion: p.motivoCancelacion ?? null,
  turno_id: p.turnoId ?? null,
});
const itemToRow = (it: OrderItem, pedidoId: string): Row => ({
  pedido_id: pedidoId,
  platillo_id: it.platilloId || null,
  platillo_nombre: it.platilloNombre,
  cantidad: it.cantidad,
  nota: it.nota ?? null,
  variante_nombre: it.varianteNombre ?? null,
  precio_unitario: it.precioUnitario ?? null,
  costo_unitario: it.costoUnitario ?? null,
  extra_concepto: it.extraConcepto ?? null,
  extra_monto: it.extraMonto ?? null,
});

const pedidoFromRow = (row: Row, itemsRows: Row[]): FondaOrder => ({
  id: row.id as string,
  clienteNombre: row.cliente_nombre as string,
  clienteTelefono: (row.cliente_telefono as string) ?? undefined,
  fecha: diaDeColumnaFecha(row.fecha),
  hora: (row.hora as string).slice(0, 5),
  horaEntrega: (row.hora_entrega as string | null)?.slice(0, 5) ?? undefined,
  estado: row.estado as FondaOrder["estado"],
  total: Number(row.total),
  empleadoId: (row.empleado_id as string) ?? undefined,
  empleadoNombreCache: (row.empleado_nombre_cache as string) ?? undefined,
  empleadoRolCache: (row.empleado_rol_cache as FondaOrder["empleadoRolCache"]) ?? undefined,
  canceladoPor: (row.cancelado_por as string) ?? undefined,
  motivoCancelacion: (row.motivo_cancelacion as string) ?? undefined,
  turnoId: (row.turno_id as string) ?? undefined,
  creadoEn: (row.created_at as string) ?? undefined,
  items: itemsRows
    .filter((it) => it.pedido_id === row.id)
    .map((it) => ({
      id: it.id as string,
      platilloId: (it.platillo_id as string) ?? "",
      platilloNombre: it.platillo_nombre as string,
      cantidad: it.cantidad as number,
      nota: (it.nota as string) ?? undefined,
      varianteNombre: (it.variante_nombre as string) ?? undefined,
      precioUnitario: it.precio_unitario != null ? Number(it.precio_unitario) : undefined,
      costoUnitario: it.costo_unitario != null ? Number(it.costo_unitario) : undefined,
      extraConcepto: (it.extra_concepto as string) ?? undefined,
      extraMonto: it.extra_monto != null ? Number(it.extra_monto) : undefined,
    })),
});

/**
 * Trae un solo pedido + sus items — la usa el canal de realtime de
 * fonda_pedidos (suscribirseAPedidosEnVivo en lib/session.ts), mismo patrón
 * que fetchVentaConItems para abarrotes_ventas: el payload de un INSERT/
 * UPDATE de Supabase solo trae la fila de fonda_pedidos, sin sus
 * fonda_pedido_items (tabla aparte).
 */
export async function fetchPedidoConItems(pedidoId: string): Promise<FondaOrder | null> {
  const { data: pedidoRow, error: pedidoError } = await supabase.from("fonda_pedidos").select("*").eq("id", pedidoId).maybeSingle();
  if (pedidoError) throw pedidoError;
  if (!pedidoRow) return null;

  const { data: itemsRows, error: itemsError } = await supabase.from("fonda_pedido_items").select("*").eq("pedido_id", pedidoId);
  if (itemsError) throw itemsError;

  return pedidoFromRow(pedidoRow, itemsRows ?? []);
}

export const gastoFromRow = (r: Row): Expense => ({
  id: r.id as string,
  categoria: r.categoria as string,
  monto: Number(r.monto),
  fecha: diaDeColumnaFecha(r.fecha),
  recordatorio: (r.recordatorio as boolean) ?? false,
  empleadoId: (r.empleado_id as string) ?? undefined,
  empleadoNombreCache: (r.empleado_nombre_cache as string) ?? undefined,
  empleadoRolCache: (r.empleado_rol_cache as Expense["empleadoRolCache"]) ?? undefined,
});
const gastoToRow = (g: Expense, negocioId: string): Row => ({
  id: g.id,
  negocio_id: negocioId,
  categoria: g.categoria,
  monto: g.monto,
  fecha: g.fecha,
  recordatorio: g.recordatorio ?? false,
  empleado_id: g.empleadoId ?? null,
  empleado_nombre_cache: g.empleadoNombreCache ?? null,
  empleado_rol_cache: g.empleadoRolCache ?? null,
});

/**
 * Gastos NUNCA pasan por el camino optimista genérico (update() +
 * syncTenantDiff en segundo plano) — PR #123, bug crítico: un gasto se
 * pintaba en la lista al toque, pero si el sync en segundo plano fallaba
 * (columna sin desplegar, RLS, red — el motivo real quedaba solo en la
 * consola, ver console.error en lib/session.ts) el gasto nunca llegaba a
 * Supabase y desaparecía en el siguiente refresh, sin que nadie se
 * enterara hasta que ya era tarde para el corte de caja. Es dinero real:
 * insertGastoDirecto/updateGastoDirecto/deleteGastoDirecto esperan la
 * confirmación real de Supabase ANTES de que la pantalla toque el estado
 * local — si falla, el error se propaga (con el detalle real de Postgres/
 * PostgREST en consola) para que quien llama pueda avisar con un toast y
 * NO pintar el gasto como si se hubiera guardado.
 */
export async function insertGastoDirecto(negocioId: string, modulo: "fonda" | "abarrotes", gastos: Expense[]): Promise<void> {
  const tabla = modulo === "fonda" ? "fonda_gastos" : "abarrotes_gastos";
  const { error } = await supabase.from(tabla).insert(gastos.map((g) => gastoToRow(g, negocioId)));
  if (error) {
    console.error(`[gastos] INSERT a ${tabla} falló — el gasto NO se guardó:`, error);
    throw error;
  }
}

export async function updateGastoDirecto(negocioId: string, modulo: "fonda" | "abarrotes", gasto: Expense): Promise<void> {
  const tabla = modulo === "fonda" ? "fonda_gastos" : "abarrotes_gastos";
  const { error } = await supabase.from(tabla).update(gastoToRow(gasto, negocioId)).eq("id", gasto.id);
  if (error) {
    console.error(`[gastos] UPDATE a ${tabla} falló — el cambio NO se guardó:`, error);
    throw error;
  }
}

export async function deleteGastoDirecto(modulo: "fonda" | "abarrotes", gastoId: string): Promise<void> {
  const tabla = modulo === "fonda" ? "fonda_gastos" : "abarrotes_gastos";
  const { error } = await supabase.from(tabla).delete().eq("id", gastoId);
  if (error) {
    console.error(`[gastos] DELETE en ${tabla} falló — el gasto sigue existiendo:`, error);
    throw error;
  }
}

async function fetchFondaData(negocioId: string): Promise<FondaData> {
  const [platillosRes, pedidosRes, gastosRes] = await Promise.all([
    supabase.from("fonda_platillos").select("*").eq("negocio_id", negocioId),
    supabase.from("fonda_pedidos").select("*").eq("negocio_id", negocioId).order("created_at", { ascending: false }),
    supabase.from("fonda_gastos").select("*").eq("negocio_id", negocioId),
  ]);
  for (const r of [platillosRes, pedidosRes, gastosRes]) {
    if (r.error) throw r.error;
  }

  const platilloIds = (platillosRes.data ?? []).map((p) => p.id as string);
  let variantesData: Row[] = [];
  if (platilloIds.length) {
    const variantesRes = await supabase.from("fonda_variantes").select("*").in("producto_id", platilloIds);
    if (variantesRes.error) throw variantesRes.error;
    variantesData = variantesRes.data ?? [];
  }

  const pedidoIds = (pedidosRes.data ?? []).map((p) => p.id as string);
  let itemsData: Row[] = [];
  if (pedidoIds.length) {
    const itemsRes = await supabase.from("fonda_pedido_items").select("*").in("pedido_id", pedidoIds);
    if (itemsRes.error) throw itemsRes.error;
    itemsData = itemsRes.data ?? [];
  }

  const pedidos: FondaOrder[] = (pedidosRes.data ?? []).map((row) => pedidoFromRow(row, itemsData));

  const platillos: Dish[] = (platillosRes.data ?? []).map((row) => {
    const dish = platilloFromRow(row);
    const variantes = variantesData.filter((v) => v.producto_id === dish.id).map(varianteFromRow);
    return variantes.length > 0 ? { ...dish, variantes } : dish;
  });

  return {
    platillos,
    pedidos,
    gastos: (gastosRes.data ?? []).map(gastoFromRow),
  };
}

/**
 * Lectura directa de pedidos pendientes — sin depender del session.fonda
 * ya cargado (que solo se refresca al iniciar sesión o vía update()
 * optimista). El panel principal la usa para no perder pedidos nuevos que
 * llegaron después de esa carga inicial. A propósito sin ningún filtro de
 * fecha/hoy/fecha_entrega/created_at: solo negocio_id + estado.
 */
export async function fetchPedidosPendientes(negocioId: string): Promise<FondaOrder[]> {
  const { data: pedidosData, error: pedidosError } = await supabase
    .from("fonda_pedidos")
    .select("*")
    .eq("negocio_id", negocioId)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false });
  if (pedidosError) throw pedidosError;

  const pedidoIds = (pedidosData ?? []).map((p) => p.id as string);
  let itemsData: Row[] = [];
  if (pedidoIds.length) {
    const { data, error } = await supabase.from("fonda_pedido_items").select("*").in("pedido_id", pedidoIds);
    if (error) throw error;
    itemsData = data ?? [];
  }

  // pedidoFromRow, NO un mapeo escrito otra vez a mano aqui.
  //
  // Aqui vivia una SEGUNDA copia del mapeo de un pedido, y esa copia se
  // habia quedado corta: mapeaba empleado_id y empleado_nombre_cache pero
  // NO empleado_rol_cache (ni creadoEn, ni el precio/costo unitario de los
  // items). Y EmpleadoBadge decide asi:
  //
  //     const esDueno = !rol || rol === "dueno";
  //
  // O sea: sin rol, pinta "Dueno". Ese es exactamente el bug que se
  // reporto — el vendedor levanta un pedido programado, el dueno refresca
  // y el pedido aparece como si lo hubiera subido el. El dato en Supabase
  // siempre estuvo bien; se perdia al LEERLO, y solo por esta pantalla.
  //
  // Tener dos mapeos del mismo registro es lo que lo causo: se le agrego
  // el rol a uno y nadie se acordo del otro. Con uno solo no puede
  // repetirse.
  return (pedidosData ?? []).map((row) => pedidoFromRow(row, itemsData));

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
  emoji: p.emoji || null,
  por_caducar: p.porCaducar ?? false,
  is_volatile: p.isVolatile ?? false,
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
  empleado_id: v.empleadoId ?? null,
  empleado_nombre_cache: v.empleadoNombreCache ?? null,
  empleado_rol_cache: v.empleadoRolCache ?? null,
  cancelada: v.cancelada ?? false,
  cancelado_por: v.canceladoPor ?? null,
  motivo_cancelacion: v.motivoCancelacion ?? null,
});
const ventaItemToRow = (it: GrocerySaleItem, ventaId: string): Row => ({
  venta_id: ventaId,
  producto_id: it.productoId || null,
  producto_nombre: it.productoNombre,
  cantidad: it.cantidad,
  precio_unitario: it.precioUnitario,
  subtotal: it.subtotal,
  costo_unitario: it.costoUnitario ?? null,
});

const fiadoToRow = (f: Fiado, negocioId: string): Row => ({
  id: f.id,
  negocio_id: negocioId,
  cliente_nombre: f.clienteNombre,
  telefono: f.telefono,
  saldo: f.saldo,
  empleado_id: f.empleadoId ?? null,
  empleado_nombre_cache: f.empleadoNombreCache ?? null,
  empleado_rol_cache: f.empleadoRolCache ?? null,
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

const saleItemFromRow = (it: Row): GrocerySaleItem => ({
  id: it.id as string,
  productoId: (it.producto_id as string) ?? "",
  productoNombre: it.producto_nombre as string,
  cantidad: it.cantidad as number,
  precioUnitario: Number(it.precio_unitario),
  subtotal: Number(it.subtotal),
  costoUnitario: it.costo_unitario != null ? Number(it.costo_unitario) : undefined,
});

const ventaFromRow = (row: Row, itemsRows: Row[]): GrocerySale => ({
  id: row.id as string,
  total: Number(row.total),
  // timestamptz de verdad (el momento de la venta), NO un día — igual que
  // barberia_caja.fecha. Ver diaDeColumnaFecha.
  fecha: row.fecha as string,
  empleadoId: (row.empleado_id as string) ?? undefined,
  empleadoNombreCache: (row.empleado_nombre_cache as string) ?? undefined,
  empleadoRolCache: (row.empleado_rol_cache as GrocerySale["empleadoRolCache"]) ?? undefined,
  cancelada: (row.cancelada as boolean) ?? false,
  canceladoPor: (row.cancelado_por as string) ?? undefined,
  motivoCancelacion: (row.motivo_cancelacion as string) ?? undefined,
  items: itemsRows.filter((it) => it.venta_id === row.id).map(saleItemFromRow),
});

/**
 * Trae una sola venta + sus items — la usa el canal de realtime de
 * abarrotes_ventas (suscribirseAVentasEnVivo en lib/session.ts): el payload
 * de un INSERT solo trae la fila de abarrotes_ventas, sin sus
 * abarrotes_sale_items (tabla aparte), así que hay que pedirlos por separado.
 */
export async function fetchVentaConItems(ventaId: string): Promise<GrocerySale | null> {
  const { data: ventaRow, error: ventaError } = await supabase
    .from("abarrotes_ventas")
    .select("*")
    .eq("id", ventaId)
    .maybeSingle();
  if (ventaError) throw ventaError;
  if (!ventaRow) return null;

  const { data: itemsRows, error: itemsError } = await supabase
    .from("abarrotes_sale_items")
    .select("*")
    .eq("venta_id", ventaId);
  if (itemsError) throw itemsError;

  return ventaFromRow(ventaRow, itemsRows ?? []);
}

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
    emoji: (row.emoji as string) || undefined,
    porCaducar: Boolean(row.por_caducar),
    isVolatile: Boolean(row.is_volatile),
    lotes: lotesData
      .filter((l) => l.producto_id === row.id)
      .map((l) => ({ cantidad: l.cantidad as number, fecha: l.fecha_caducidad as string })),
  }));

  const fiados: Fiado[] = (fiadosRes.data ?? []).map((row) => ({
    id: row.id as string,
    clienteNombre: row.cliente_nombre as string,
    telefono: row.telefono as string,
    saldo: Number(row.saldo),
    empleadoId: (row.empleado_id as string) ?? undefined,
    empleadoNombreCache: (row.empleado_nombre_cache as string) ?? undefined,
    empleadoRolCache: (row.empleado_rol_cache as Fiado["empleadoRolCache"]) ?? undefined,
    historial: movimientosData
      .filter((m) => m.fiado_id === row.id)
      .map((m) => ({ fecha: diaDeColumnaFecha(m.fecha), monto: Number(m.monto), tipo: m.tipo as "cargo" | "abono" })),
  }));

  const ventas: GrocerySale[] = (ventasRes.data ?? []).map((row) => ventaFromRow(row, saleItemsData));

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
  if (error) {
    console.error('persistTenant: insert en "negocios" falló:', error);
    throw error;
  }

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
    await mustInsert(
      "fonda_variantes",
      f.platillos.flatMap((p) => (p.variantes ?? []).map((v) => varianteToRow(v, p.id)))
    );
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
    await cleanInsert(table, inserts);
  }
  for (const row of updates) {
    await cleanUpdate(table, row);
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

/** Reemplaza por completo las variantes de un platillo cuando el platillo cambió (mismo patrón que syncAbarrotesProductos con lotes). */
async function syncFondaPlatillos(negocioId: string, prevArr: Dish[], nextArr: Dish[]): Promise<void> {
  await diffAndSync("fonda_platillos", prevArr, nextArr, (p) => platilloToRow(p, negocioId));

  const prevMap = new Map(prevArr.map((p) => [p.id, p]));
  for (const p of nextArr) {
    const prevP = prevMap.get(p.id);
    if (prevP && JSON.stringify(prevP.variantes ?? []) === JSON.stringify(p.variantes ?? [])) continue;
    await supabase.from("fonda_variantes").delete().eq("producto_id", p.id);
    await mustInsert(
      "fonda_variantes",
      (p.variantes ?? []).map((v) => varianteToRow(v, p.id))
    );
  }
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
  /** servicioId: para bloquear el hueco real según la duración del servicio (ver getDaySlots, lib/agenda.ts) — no es dato personal, solo qué se agendó. */
  citas: Pick<Appointment, "fecha" | "hora" | "estado" | "servicioId">[];
}

/** Datos mínimos y públicos para calcular huecos disponibles, sin exponer clientes de otros. */
export async function fetchPublicBookingData(negocioId: string): Promise<PublicBookingData> {
  const [servicios, horario, excepciones, citas] = await Promise.all([
    supabase.from("barberia_servicios").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_horario").select("*").eq("negocio_id", negocioId),
    supabase.from("barberia_excepciones").select("*").eq("negocio_id", negocioId),
    // RPC en vez de .from("barberia_citas_publicas"): esa vista se salta el
    // RLS (no lleva security_invoker) y `anon` podía pedirla SIN filtro, o
    // sea bajarse las citas de TODOS los negocios de un jalón. La función
    // exige el negocio como parámetro, así que ya no hay forma de pedir
    // "todas". Devuelve exactamente las mismas columnas. Ver migración
    // 20260920000000.
    supabase.rpc("citas_publicas_de_negocio", { p_negocio_id: negocioId }),
  ]);
  for (const r of [servicios, horario, excepciones, citas]) {
    if (r.error) throw r.error;
  }
  return {
    servicios: (servicios.data ?? []).map(servicioFromRow),
    horario: (horario.data ?? []).map(horarioFromRow),
    excepciones: (excepciones.data ?? []).map(excepcionFromRow),
    citas: ((citas.data ?? []) as Row[]).map((r) => ({
      fecha: diaDeColumnaFecha(r.fecha),
      hora: (r.hora as string).slice(0, 5),
      estado: r.estado as Appointment["estado"],
      servicioId: r.servicio_id as string,
    })),
  };
}

export interface SubmitCitaInput {
  servicioId: string;
  nombre: string;
  telefono: string;
  fecha: string;
  hora: string;
}

/**
 * Reserva pública desde /b/[slug]. En vez de escribir directo a Supabase
 * desde el navegador, pasa por /api/public/citas: esa ruta valida el body
 * (zod), confirma que el slug es de un negocio activo y aplica rate limit
 * por IP (10/min) antes de tocar la base de datos. RLS sigue siendo la
 * última línea de defensa (la ruta usa la anon key, no service_role).
 */
export async function submitPublicCita(slug: string, input: SubmitCitaInput): Promise<void> {
  const res = await fetch("/api/public/citas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, ...input }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "No se pudo agendar tu cita.");
  }
}

export interface CitaCliente {
  clienteNombre: string;
  servicioNombre: string;
  precio: number;
  fecha: string;
  hora: string;
}

/**
 * Citas pendientes de un cliente en /b/[slug]/cliente, buscadas por su
 * propio teléfono vía /api/public/citas/lookup (que a su vez llama a
 * get_citas_por_telefono, security definer). Sin login, el teléfono exacto
 * es la prueba de que son sus propias citas — por eso esta ruta lleva rate
 * limit por IP, para que no se pueda usar como barrido de teléfonos.
 */
export async function fetchCitasByTelefono(slug: string, telefono: string): Promise<CitaCliente[]> {
  const res = await fetch("/api/public/citas/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, telefono }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "No se pudieron buscar tus citas.");
  }
  const { citas } = await res.json();
  return ((citas ?? []) as Record<string, unknown>[]).map((r) => ({
    clienteNombre: r.cliente_nombre as string,
    servicioNombre: r.servicio_nombre as string,
    precio: Number(r.precio),
    fecha: diaDeColumnaFecha(r.fecha),
    hora: (r.hora as string).slice(0, 5),
  }));
}

/**
 * UPDATE a `negocios` que no se cae entero por UNA columna que esta base no
 * tenga todavía.
 *
 * EL BUG QUE ARREGLA
 * Guardar en Ajustes > Configuración escribe whatsapp, teléfono, teléfono de
 * contacto y días de recordatorio en UN SOLO update. En la base de Owen
 * faltaba `dias_recordatorio` (una migración vieja que nunca se corrió ahí),
 * así que PostgREST rechazaba la petición COMPLETA:
 *
 *     400  PGRST204  Could not find the 'dias_recordatorio' column
 *
 * y con ella se caían también el teléfono y el WhatsApp — que sí existían y
 * sí se podían guardar. De ahí el "no se guarda el número que pide en los
 * datos": el número estaba bien, lo tumbaba un campo vecino.
 *
 * La migración 20260914000000 agrega la columna que faltaba, pero eso
 * arregla ESTE caso, no la forma. Cualquier columna nueva que se agregue al
 * código antes de correr su migración vuelve a tumbar todo el guardado.
 * Aquí se corta esa clase: si el servidor dice que no conoce una columna, se
 * quita esa sola y se reintenta con el resto, avisando fuerte en consola.
 * Es mejor guardar 3 de 4 campos y dejar rastro que perder los 4 en
 * silencio.
 */
async function actualizarNegocioTolerante(negocioId: string, cambios: Row): Promise<void> {
  let pendientes = { ...cambios };

  // Como mucho, una vuelta por columna: PostgREST solo se queja de una a la
  // vez, así que N columnas desconocidas necesitan N reintentos.
  for (let intento = 0; intento <= Object.keys(cambios).length; intento++) {
    const { error } = await supabase.from("negocios").update(pendientes).eq("id", negocioId);
    if (!error) return;

    // PGRST204 = "no encuentro esa columna en el esquema". El nombre viene
    // entre comillas simples dentro del mensaje.
    const columna = error.code === "PGRST204" ? /'([^']+)' column/.exec(error.message)?.[1] : undefined;
    if (!columna || !(columna in pendientes)) throw error;

    console.error(
      `[negocios] tu base no tiene la columna "${columna}" — se guarda el resto sin ella. ` +
        "Corre las migraciones pendientes de supabase/migrations para que ese campo también se guarde."
    );
    const { [columna]: _descartado, ...resto } = pendientes;
    pendientes = resto;
    if (Object.keys(pendientes).length === 0) return;
  }
}

/** Compara el estado anterior y el nuevo de la sesión y aplica los cambios en Supabase. */
export async function syncTenantDiff(prev: TenantData, next: TenantData): Promise<void> {
  const negocioId = next.business.id;

  // A diferencia de barberia/fonda/abarrotes (sub-objetos con listas que se
  // diffean campo por campo), `business` vive directo en la fila `negocios`
  // — los únicos campos editables desde /app hoy son whatsapp, telefono,
  // telefonoContacto y diasRecordatorio (Configuración > General), así que
  // solo esos se comparan y sincronizan.
  const businessChanges: Row = {};
  if (prev.business.whatsapp !== next.business.whatsapp) businessChanges.whatsapp = next.business.whatsapp ?? null;
  if (prev.business.telefono !== next.business.telefono) businessChanges.telefono = next.business.telefono;
  if (prev.business.telefonoContacto !== next.business.telefonoContacto) {
    businessChanges.telefono_contacto = next.business.telefonoContacto || null;
  }
  if (prev.business.diasRecordatorio !== next.business.diasRecordatorio) {
    businessChanges.dias_recordatorio = next.business.diasRecordatorio ?? 28;
  }
  if (prev.business.turnoFondaCerradoEn !== next.business.turnoFondaCerradoEn) {
    businessChanges.turno_fonda_cerrado_en = next.business.turnoFondaCerradoEn ?? null;
  }
  if (prev.business.turnoCerradoEn !== next.business.turnoCerradoEn) {
    businessChanges.turno_cerrado_en = next.business.turnoCerradoEn ?? null;
  }
  if (Object.keys(businessChanges).length > 0) {
    await actualizarNegocioTolerante(negocioId, businessChanges);
  }

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
    await syncFondaPlatillos(negocioId, p.platillos, n.platillos);
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

/**
 * Descuenta el stock de una venta EN POSTGRES, no en el cliente.
 *
 * EL BUG QUE CIERRA
 * `descontar_stock_atomico` existía desde la Parte 4 de PWA, pero solo la
 * usaba la subida de la cola offline (lib/sync-queue.ts). La venta normal
 * iba por update() -> syncTenantDiff, que manda `stock = <valor final
 * calculado en el cliente>`. Con dos cajas vendiendo el mismo producto a la
 * vez, cada una calcula sobre SU copia (10-2=8 y 10-1=9) y la última en
 * escribir gana: se pierde un descuento. Owen: "solo se cuenta en 1 lado y
 * solo se descuenta 1".
 *
 * La función de Postgres resta la CANTIDAD contra el stock real con
 * `select ... for update`, así que la segunda llamada ve el stock ya
 * descontado por la primera. Devuelve el stock REAL que quedó, para que la
 * pantalla se quede con el número del servidor y no con su propio cálculo.
 *
 * Las líneas sin `productoId` (venta rápida de algo que no está en el
 * inventario) se saltan: no hay stock que descontar.
 *
 * POR QUÉ DEVUELVE TAMBIÉN LAS QUE FALLARON
 * Si una línea no se pudo descontar en el servidor (la función todavía no
 * existe porque falta correr la migración, se cayó la red a media venta, lo
 * que sea), su stock quedó SIN tocar allá. Quien llama necesita saber
 * exactamente cuáles fueron para descontarlas por el camino de siempre; si
 * se tragara el error en silencio, la venta quedaría guardada y el stock
 * intacto — un faltante de inventario que nadie ve hasta que se acaba el
 * producto en el estante y la app dice que todavía hay.
 */
export async function descontarStockEnServidor(
  lineas: { productoId?: string | null; cantidad: number }[]
): Promise<{ stockPorProducto: Map<string, number>; fallaron: string[] }> {
  const stockPorProducto = new Map<string, number>();
  const fallaron: string[] = [];
  for (const linea of lineas) {
    if (!linea.productoId || linea.cantidad <= 0) continue;
    try {
      const { data, error } = await supabase.rpc("descontar_stock_atomico", {
        p_producto_id: linea.productoId,
        p_cantidad: linea.cantidad,
      });
      if (error) throw error;
      const fila = Array.isArray(data) ? data[0] : data;
      if (fila && fila.stock_final != null) {
        stockPorProducto.set(linea.productoId, Number(fila.stock_final));
      } else {
        fallaron.push(linea.productoId);
      }
    } catch (err) {
      console.error(`[stock] no se pudo descontar ${linea.cantidad} de ${linea.productoId}:`, err);
      fallaron.push(linea.productoId);
    }
  }
  return { stockPorProducto, fallaron };
}
