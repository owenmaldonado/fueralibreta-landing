// Tipos compartidos de Fuera Libreta. Todo el MVP corre sobre datos mock
// (ver lib/mock.ts); estos tipos describen la forma de esos datos y son
// el contrato que usarán las pantallas reales cuando se conecten a Supabase.

export type BusinessType = "barberia" | "fonda" | "abarrotes";

export interface Business {
  id: string;
  ownerId?: string; // auth.users.id en Supabase; ausente mientras es solo una demo local
  slug: string;
  nombre: string;
  tipo: BusinessType;
  dueno: string;
  telefono: string;
  direccion?: string;
  is_active: boolean;
  trial_fin: string; // ISO date
  created_at: string; // ISO date
  demo?: boolean;
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
}

export interface CajaEntry {
  id: string;
  tipo: "venta" | "propina" | "gasto";
  concepto: string;
  monto: number;
  metodo: "efectivo" | "transferencia";
  fecha: string; // ISO datetime
}

export interface InventoryProduct {
  id: string;
  nombre: string;
  stock: number;
  minimo: number;
}

// ---------- Fonda ----------

export interface Dish {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
  activoHoy: boolean;
}

export interface OrderItem {
  id: string;
  platilloId: string;
  platilloNombre: string;
  cantidad: number;
  nota?: string;
}

export type OrderStatus = "pendiente" | "entregado";

export interface FondaOrder {
  id: string;
  clienteNombre: string;
  clienteTelefono?: string;
  hora: string;
  items: OrderItem[];
  estado: OrderStatus;
  total: number;
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
  lotes?: { cantidad: number; fecha: string }[];
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
}

export interface GrocerySaleItem {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface GrocerySale {
  id: string;
  items: GrocerySaleItem[];
  total: number;
  fecha: string; // ISO datetime
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

export type SessionUpdater = (fn: (prev: TenantData) => TenantData) => void;
