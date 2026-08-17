// Tipos compartidos de Fuera Libreta. Todo el MVP corre sobre datos mock
// (ver lib/mock.ts); estos tipos describen la forma de esos datos y son
// el contrato que usarán las pantallas reales cuando se conecten a Supabase.

import type { PlanId } from "./planes";

export type BusinessType = "barberia" | "fonda" | "abarrotes";

// ---------- Multiusuario (modo PIN) ----------
// Ver lib/empleados.ts. Un negocio real (no demo) puede dar de alta
// empleados con PIN de 4 dígitos, sin cuenta propia — negocio_empleados.
// user_id queda nullable, preparado para un futuro empleado con cuenta
// propia (ver comentario en supabase/migrations/20260815000000_esquema.sql), pero hoy siempre es null.

export type RolEmpleado = "dueno" | "encargado" | "vendedor";

export interface Empleado {
  id: string;
  negocioId: string;
  nombre: string;
  rol: RolEmpleado;
  activo: boolean;
  userId?: string;
  createdAt: string;
}

/** Lo que se guarda en la cookie fl_empleado tras un PIN correcto — ver lib/empleados.ts. */
export interface EmpleadoActual {
  id: string;
  nombre: string;
  rol: RolEmpleado;
}

export interface Business {
  id: string;
  ownerId?: string; // auth.users.id en Supabase; ausente mientras es solo una demo local
  slug: string;
  nombre: string;
  tipo: BusinessType;
  dueno: string;
  telefono: string;
  /** Número de WhatsApp para recibir citas/confirmaciones (ej. 521XXXXXXXXXX). Distinto de `telefono`: se configura aparte en Configuración > Perfil. */
  whatsapp?: string;
  direccion?: string;
  is_active: boolean;
  trial_fin: string; // ISO date
  created_at: string; // ISO date
  demo?: boolean;
  /** A qué app del hub de super admin pertenece (ver mis_apps). Este repo solo genera 'fuera-libreta'. */
  appSlug: string;
  /** IANA (ej. "America/Bahia_Banderas"). Opcional: sin columna en Supabase todavía, los paneles caen a un default fijo si no viene. */
  timezone?: string;
  /**
   * Plan de features (ver lib/planes.ts) — SOLO lectura desde /app: lo
   * cambia /admin vía service_role. syncTenantDiff (lib/data.ts) no lo
   * incluye en los campos que sincroniza desde la sesión del dueño, así
   * que aunque esté aquí en memoria nunca se manda de vuelta a Supabase
   * desde su propia cuenta (y la base de datos lo bloquea igual con un
   * trigger, por si acaso).
   */
  plan: PlanId;
  /** Precio mensual negociado a mano en vez del de lista; null = precio normal del plan. Admin-only, mismo trato que `plan`. */
  precioCustom: number | null;
  /** Insignia de "Fundador" (marketing/trato especial) — admin-only, mismo trato que `plan`. */
  esFundador: boolean;
  /** Días sin venir a partir de los cuales Clientes marca a alguien para recordatorio (badge + mensaje de WhatsApp distinto). Configurable en Configuración > General; 28 si no se ha configurado. */
  diasRecordatorio?: number;
}

// ---------- Barbería ----------

export interface BarberService {
  id: string;
  nombre: string;
  precio: number;
  duracion_min: number;
}

export interface HorarioDia {
  dia: "Lun" | "Mar" | "Mié" | "Jue" | "Vie" | "Sáb" | "Dom";
  abierto: boolean;
  inicio: string; // "09:00"
  fin: string; // "19:00"
}

export interface Excepcion {
  id: string;
  fecha: string; // ISO date
  etiqueta: string; // "Vacaciones" | "Cierro a las 2" ...
  cerrado: boolean;
  horaEspecialFin?: string;
}

export interface BarberClient {
  id: string;
  nombre: string;
  telefono: string;
  ultimaVisita: string | null; // ISO date
  visitas: number;
  notas?: string;
  cumpleanos?: string; // MM-DD
}

export type AppointmentStatus = "pendiente" | "listo" | "cancelada";

export interface Appointment {
  id: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  servicioId: string;
  servicioNombre: string;
  precio: number;
  fecha: string; // ISO date (day)
  hora: string; // "15:00"
  estado: AppointmentStatus;
  /** Cómo se cobró el corte. Se pide al marcar la cita como "listo"; ausente en citas viejas o que nunca se cobraron. */
  metodo?: "efectivo" | "transferencia";
  /** Quién atendió/cobró (ver Multiusuario > modo PIN, lib/empleados.ts) — ausente en citas de antes de este campo o cobradas por el dueño directo. */
  empleadoId?: string;
  empleadoNombreCache?: string;
  /** Cancelación por un rol "vendedor" (no puede borrar, solo cancelar — ver PERMISOS en lib/empleados.ts). */
  canceladoPor?: string;
  motivoCancelacion?: string;
}

export interface CajaEntry {
  id: string;
  tipo: "venta" | "propina" | "gasto";
  concepto: string;
  monto: number;
  metodo: "efectivo" | "transferencia";
  fecha: string; // ISO datetime
  empleadoId?: string;
  empleadoNombreCache?: string;
}

export interface InventoryProduct {
  id: string;
  nombre: string;
  stock: number;
  minimo: number;
  /** Si al descontar stock (Consumir / Eliminar del inventario) llega a 0, elimina el producto en vez de dejarlo en stock 0. Se configura por producto (Nuevo/editar producto), OFF por defecto. */
  eliminarEnCero: boolean;
}

// ---------- Fonda ----------

/** Variante de un platillo (ej. proteína: Pollo/Bistec) — mismo platillo, precio ajustado. */
export interface DishVariant {
  id: string;
  tipo: string;
  valor: string;
  precioExtra: number;
  disponible: boolean;
}

export interface Dish {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
  activoHoy: boolean;
  /** Costo del platillo (insumos), opcional — a diferencia de Abarrotes, Fondita no calcula ganancia real con esto todavía (ver app/app/gastos/page.tsx). */
  costo?: number;
  variantes?: DishVariant[];
  /** Resultado de la merma del último cierre de turno (ver CerrarTurnoSheet): "sobró" mantiene el platillo activo para mañana con un badge en Menú, en vez de tener que volver a prenderlo a mano. Se limpia (undefined) en cuanto "se acabó" o "se tiró". */
  estadoMerma?: "sobro_poco" | "sobro_mucho";
}

export interface OrderItem {
  id: string;
  platilloId: string;
  platilloNombre: string;
  cantidad: number;
  nota?: string;
  /** Variante elegida (ej. "Pollo") cuando el platillo tiene variantes — se muestra en el ticket como "platillo c/ variante", separado de `nota` (comentarios libres). */
  varianteNombre?: string;
  /** Precio de venta (platillo.precio + precioExtra de la variante elegida) AL MOMENTO de crear el pedido — snapshot para que Ganancias no recalcule pedidos viejos si el precio del platillo cambia después. Ausente en pedidos de antes de este campo: Ganancias cae al precio ACTUAL del platillo, igual que antes. */
  precioUnitario?: number;
  /** Costo del platillo AL MOMENTO de crear el pedido — mismo snapshot que costoUnitario en abarrotes_sale_items, por item de Fondita. Ausente = el platillo no tenía costo puesto en ese momento (esa venta cuenta $0 de margen, no se le inventa uno con el costo de hoy). */
  costoUnitario?: number;
}

export type OrderStatus = "pendiente" | "entregado" | "cancelado";

export interface FondaOrder {
  id: string;
  clienteNombre: string;
  clienteTelefono?: string;
  fecha: string; // ISO date (day) — para filtrar Hoy/Ayer/Semana
  hora: string;
  /** Hora en que el cliente pidió que estuviera listo, opcional (12:00pm–10:00pm cada 30 min). */
  horaEntrega?: string;
  items: OrderItem[];
  estado: OrderStatus;
  total: number;
  /** Quién atendió/cobró (ver Multiusuario > modo PIN, lib/empleados.ts) — ausente en pedidos de antes de este campo o cobrados por el dueño directo. */
  empleadoId?: string;
  empleadoNombreCache?: string;
  /** Cancelación por un rol "vendedor" (no puede borrar, solo cancelar — ver PERMISOS en lib/empleados.ts). */
  canceladoPor?: string;
  motivoCancelacion?: string;
}

export interface Expense {
  id: string;
  categoria: string;
  monto: number;
  fecha: string; // ISO date
  recordatorio?: boolean;
}

// ---------- Abarrotes ----------

export interface GroceryProduct {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string;
  costo: number;
  precio: number;
  stock: number;
  minimo: number;
  controlCaducidad: boolean;
  unidad: "pieza" | "kg" | "granel";
  /** Emoji/ícono elegido a mano para este producto (se ve en el grid de Nueva Venta). Si no hay, se usa un default por categoría. */
  emoji?: string;
  lotes?: { cantidad: number; fecha: string }[];
  /** Producto de precio volátil (fruta/verdura): vive en el panel "Frutas y Verdura", no en la lista normal de Inventario. */
  isVolatile?: boolean;
  /** Marcado en Cerrar Día > Caducados como "por caducar mañana" (ver CerrarDiaSheet) — badge amarillo en Hoy hasta que un próximo cierre lo resuelva (se vendió todo o caducó). */
  porCaducar?: boolean;
}

export interface FiadoMovimiento {
  fecha: string;
  monto: number;
  tipo: "cargo" | "abono";
}

export interface Fiado {
  id: string;
  clienteNombre: string;
  telefono: string;
  saldo: number;
  historial: FiadoMovimiento[];
}

export interface Apartado {
  id: string;
  clienteNombre: string;
  telefono: string;
  producto: string;
  total: number;
  abonado: number;
  fechaLimite: string; // ISO date
  entregado: boolean;
}

export interface GrocerySaleItem {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  /** Costo del producto AL MOMENTO de la venta (snapshot en cobrar()), para que la ganancia histórica no cambie si el costo del producto se edita después. Ausente en ventas de antes de este campo — ahí se cae al costo actual del producto. */
  costoUnitario?: number;
}

export interface GrocerySale {
  id: string;
  items: GrocerySaleItem[];
  total: number;
  fecha: string; // ISO datetime
  empleadoId?: string;
  empleadoNombreCache?: string;
  /** Ausente = venta activa. Un rol "vendedor" no puede borrar ventas, solo cancelarlas (ver PERMISOS en lib/empleados.ts) — se excluye de ventas/ganancias igual que si se hubiera borrado, pero queda el registro. */
  cancelada?: boolean;
  canceladoPor?: string;
  motivoCancelacion?: string;
}

// ---------- Sesión / tenant activo ----------
// Todo el negocio del dueño logueado vive en un solo blob en localStorage.
// En producción cada colección sería una tabla de Supabase filtrada por
// negocio_id; aquí es el "mock data" que pide la spec del MVP.

export interface BarberiaData {
  servicios: BarberService[];
  horario: HorarioDia[];
  excepciones: Excepcion[];
  clientes: BarberClient[];
  citas: Appointment[];
  caja: CajaEntry[];
  productos: InventoryProduct[];
}

export interface FondaData {
  platillos: Dish[];
  pedidos: FondaOrder[];
  gastos: Expense[];
}

export interface AbarrotesData {
  productos: GroceryProduct[];
  ventas: GrocerySale[];
  fiados: Fiado[];
  apartados: Apartado[];
  gastos: Expense[];
}

export interface TenantData {
  business: Business;
  barberia?: BarberiaData;
  fonda?: FondaData;
  abarrotes?: AbarrotesData;
}

/**
 * ventaOffline: true — ÚNICA forma de que update() aplique un cambio
 * cuando no hay conexión (ver lib/session.ts). Sin ella, sin red, update()
 * rechaza el cambio con un toast en vez de aplicarlo — "solo puedes seguir
 * vendiendo" es una decisión de diseño explícita (Parte 3 de PWA), no un
 * detalle de implementación: cualquier pantalla nueva que llame update()
 * queda bloqueada sin red por defecto, a menos que sea uno de los flujos de
 * venta explícitamente marcados.
 */
export type SessionUpdater = (fn: (prev: TenantData) => TenantData, opciones?: { ventaOffline?: boolean }) => void;
