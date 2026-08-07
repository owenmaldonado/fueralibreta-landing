import type {
  Business,
  BusinessType,
  TenantData,
  BarberiaData,
  FondaData,
  AbarrotesData,
} from "./types";

// ---------- Helpers generales ----------

/**
 * Genera un id. Siempre es un UUID v4 válido (aunque se ignore el prefijo)
 * porque estos ids se insertan tal cual como primary key `uuid` en Supabase
 * cuando el negocio se conecta a la base de datos real.
 */
export function uid(_prefix = "id"): string {
  return crypto.randomUUID();
}

export function slugify(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).slice(2, 5);
  return `${base || "negocio"}-${suffix}`;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

/** "14:00" -> "2:00 PM". Para mostrar horas de 24h guardadas en la base como 12h. */
export function formatHora12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 || 12;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Fecha LOCAL en formato YYYY-MM-DD. Ojo: NO usar d.toISOString() aquí —
 * eso da la fecha en UTC, que se adelanta o atrasa hasta varias horas
 * respecto al día local (en México, de 6pm a medianoche ya es "mañana" en
 * UTC). Como los <input type="date"> del navegador siempre devuelven la
 * fecha local, comparar contra una fecha en UTC hacía que "Hoy" mostrara
 * citas de ayer o se comiera las de hoy según la hora del día.
 */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function todayISO(offsetDays = 0): string {
  return toISODate(addDays(new Date(), offsetDays));
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = new Date().getTime();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * ultimaVisita/visitas en BarberClient solo se pisan a mano en un par de
 * lugares y nunca se actualizan cuando una cita se marca "listo" — se
 * quedan en null/0 para siempre. En vez de perseguir cada sitio que crea o
 * cierra una cita para mantenerlos sincronizados, se calculan aquí al vuelo
 * a partir de las citas reales (fuente de verdad única).
 */
export function statsVisitasCliente(citas: { clienteId: string; fecha: string; estado: string }[], clienteId: string) {
  const atendidas = citas.filter((c) => c.clienteId === clienteId && c.estado === "listo");
  if (atendidas.length === 0) return { ultimaVisita: null as string | null, visitas: 0 };
  const ultimaVisita = atendidas.reduce((max, c) => (c.fecha > max ? c.fecha : max), atendidas[0].fecha);
  return { ultimaVisita, visitas: atendidas.length };
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Construye un link de WhatsApp con mensaje precargado. */
export function waLink(telefono: string, mensaje: string): string {
  let digits = onlyDigits(telefono);
  if (digits.length === 10) digits = `52${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(mensaje)}`;
}

export const NUMERO_CONTACTO = "3329098631";
export const WA_CONTACTO = waLink(NUMERO_CONTACTO, "Hola, quiero información de Fuera Libreta");

export const NOMBRES_NEGOCIO: Record<BusinessType, string> = {
  barberia: "Barbería",
  fonda: "Fonda",
  abarrotes: "Abarrotes",
};

// ---------- Catálogos base ----------

export const HORARIO_DEFAULT: BarberiaData["horario"] = [
  { dia: "Lun", abierto: true, inicio: "09:00", fin: "19:00" },
  { dia: "Mar", abierto: true, inicio: "10:00", fin: "18:00" },
  { dia: "Mié", abierto: true, inicio: "09:00", fin: "19:00" },
  { dia: "Jue", abierto: true, inicio: "09:00", fin: "19:00" },
  { dia: "Vie", abierto: true, inicio: "09:00", fin: "20:00" },
  { dia: "Sáb", abierto: true, inicio: "09:00", fin: "17:00" },
  { dia: "Dom", abierto: false, inicio: "10:00", fin: "14:00" },
];

const SERVICIOS_DEFAULT = [
  { nombre: "Corte clásico", precio: 120, duracion_min: 30 },
  { nombre: "Corte + barba", precio: 180, duracion_min: 45 },
  { nombre: "Solo barba", precio: 90, duracion_min: 20 },
  { nombre: "Corte niño", precio: 100, duracion_min: 25 },
];

const PLATILLOS_DEFAULT: { nombre: string; precio: number; categoria: string }[] = [
  { nombre: "Pozole", precio: 65, categoria: "Platillo fuerte" },
  { nombre: "Mole con pollo", precio: 70, categoria: "Platillo fuerte" },
  { nombre: "Chiles rellenos", precio: 60, categoria: "Platillo fuerte" },
  { nombre: "Sopa de fideo", precio: 35, categoria: "Entrada" },
  { nombre: "Agua de horchata", precio: 20, categoria: "Bebida" },
];

const PRODUCTOS_ABARROTES_DEFAULT: {
  nombre: string;
  categoria: string;
  costo: number;
  precio: number;
  stock: number;
  controlCaducidad: boolean;
  unidad: "pieza" | "kg" | "granel";
}[] = [
  { nombre: "Coca-Cola 600ml", categoria: "Bebidas", costo: 13, precio: 20, stock: 24, controlCaducidad: false, unidad: "pieza" },
  { nombre: "Leche Lala 1L", categoria: "Lácteos", costo: 22, precio: 28, stock: 10, controlCaducidad: true, unidad: "pieza" },
  { nombre: "Bimbo Blanco", categoria: "Panadería", costo: 34, precio: 42, stock: 6, controlCaducidad: true, unidad: "pieza" },
  { nombre: "Arroz 1kg", categoria: "Abarrotes", costo: 18, precio: 25, stock: 15, controlCaducidad: false, unidad: "pieza" },
];

// ---------- Constructor de negocio ----------

interface NuevoNegocioInput {
  dueno: string;
  nombre: string;
  telefono: string;
  tipo: BusinessType;
  demo?: boolean;
}

export function createBusiness(input: NuevoNegocioInput): Business {
  return {
    id: uid("biz"),
    slug: slugify(input.nombre),
    nombre: input.nombre,
    tipo: input.tipo,
    dueno: input.dueno,
    telefono: input.telefono,
    is_active: true,
    trial_fin: todayISO(7),
    created_at: todayISO(0),
    demo: input.demo ?? false,
    appSlug: "fuera-libreta",
  };
}

function emptyBarberiaData(): BarberiaData {
  return {
    servicios: SERVICIOS_DEFAULT.map((s) => ({ id: uid("srv"), ...s })),
    horario: HORARIO_DEFAULT,
    excepciones: [],
    clientes: [],
    citas: [],
    caja: [],
    productos: [
      { id: uid("prod"), nombre: "Gel", stock: 8, minimo: 3 },
      { id: uid("prod"), nombre: "Cera", stock: 5, minimo: 3 },
      { id: uid("prod"), nombre: "Shampoo", stock: 4, minimo: 4 },
    ],
  };
}

function emptyFondaData(): FondaData {
  return {
    platillos: PLATILLOS_DEFAULT.map((p) => ({ id: uid("dish"), activoHoy: true, ...p })),
    pedidos: [],
    gastos: [],
  };
}

function emptyAbarrotesData(): AbarrotesData {
  return {
    productos: PRODUCTOS_ABARROTES_DEFAULT.map((p) => ({
      id: uid("gp"),
      codigo: Math.floor(1000000000 + Math.random() * 8999999999).toString(),
      minimo: 5,
      lotes: [],
      ...p,
    })),
    ventas: [],
    fiados: [],
    apartados: [],
    gastos: [],
  };
}

/** Crea un tenant nuevo y vacío (flujo /onboarding). */
export function createEmptyTenant(input: NuevoNegocioInput): TenantData {
  const business = createBusiness(input);
  const data: TenantData = { business };
  if (input.tipo === "barberia") data.barberia = emptyBarberiaData();
  if (input.tipo === "fonda") data.fonda = emptyFondaData();
  if (input.tipo === "abarrotes") data.abarrotes = emptyAbarrotesData();
  return data;
}

// ---------- Generador de demo personalizada ----------

export interface DemoFormBarberia {
  dueno: string;
  negocio: string;
  telefono: string;
  cliente1: string;
  cliente2: string;
}

export interface DemoFormFonda {
  dueno: string;
  negocio: string;
  telefono: string;
  platillo1: string;
  platillo2: string;
}

export interface DemoFormAbarrotes {
  dueno: string;
  negocio: string;
  telefono: string;
  producto1: string;
  producto2: string;
}

export function generateDemoBarberia(form: DemoFormBarberia): TenantData {
  const business = createBusiness({
    dueno: form.dueno,
    nombre: form.negocio,
    telefono: form.telefono,
    tipo: "barberia",
    demo: true,
  });
  const data = emptyBarberiaData();

  const cliente1Id = uid("cli");
  const cliente2Id = uid("cli");
  data.clientes = [
    {
      id: cliente1Id,
      nombre: form.cliente1 || "Cliente nuevo",
      telefono: "3311122233",
      ultimaVisita: null,
      visitas: 0,
      notas: "Primera vez, lo agendó por WhatsApp.",
    },
    {
      id: cliente2Id,
      nombre: form.cliente2 || "Cliente frecuente",
      telefono: "3311122244",
      ultimaVisita: todayISO(-28),
      visitas: 12,
      notas: "Le gusta el corte bajo con línea.",
    },
  ];

  data.citas = [
    {
      id: uid("cita"),
      clienteId: cliente1Id,
      clienteNombre: data.clientes[0].nombre,
      clienteTelefono: data.clientes[0].telefono,
      servicioId: data.servicios[0].id,
      servicioNombre: data.servicios[0].nombre,
      precio: data.servicios[0].precio,
      fecha: todayISO(0),
      hora: "15:00",
      estado: "pendiente",
    },
    {
      id: uid("cita"),
      clienteId: cliente2Id,
      clienteNombre: data.clientes[1].nombre,
      clienteTelefono: data.clientes[1].telefono,
      servicioId: data.servicios[1].id,
      servicioNombre: data.servicios[1].nombre,
      precio: data.servicios[1].precio,
      fecha: todayISO(1),
      hora: "11:00",
      estado: "pendiente",
    },
    {
      id: uid("cita"),
      clienteId: cliente2Id,
      clienteNombre: data.clientes[1].nombre,
      clienteTelefono: data.clientes[1].telefono,
      servicioId: data.servicios[0].id,
      servicioNombre: data.servicios[0].nombre,
      precio: data.servicios[0].precio,
      fecha: todayISO(-1),
      hora: "16:00",
      estado: "listo",
    },
  ];

  data.caja = [
    { id: uid("caja"), tipo: "venta", concepto: "Corte clásico", monto: 120, metodo: "efectivo", fecha: `${todayISO(-1)}T13:10:00` },
    { id: uid("caja"), tipo: "propina", concepto: "Propina", monto: 20, metodo: "efectivo", fecha: `${todayISO(-1)}T13:11:00` },
  ];

  return { business, barberia: data };
}

export function generateDemoFonda(form: DemoFormFonda): TenantData {
  const business = createBusiness({
    dueno: form.dueno,
    nombre: form.negocio,
    telefono: form.telefono,
    tipo: "fonda",
    demo: true,
  });
  const data = emptyFondaData();

  const d1 = { id: uid("dish"), nombre: form.platillo1 || "Platillo de hoy 1", precio: 65, categoria: "Platillo fuerte", activoHoy: true };
  const d2 = { id: uid("dish"), nombre: form.platillo2 || "Platillo de hoy 2", precio: 70, categoria: "Platillo fuerte", activoHoy: true };
  data.platillos = [d1, d2, ...data.platillos.slice(2)];

  data.pedidos = [
    {
      id: uid("ped"),
      clienteNombre: "Doña Rosa",
      clienteTelefono: "3312345678",
      fecha: todayISO(0),
      hora: "13:30",
      horaEntrega: "14:00",
      items: [
        { id: uid("it"), platilloId: d1.id, platilloNombre: d1.nombre, cantidad: 2, nota: "Sin cebolla" },
        { id: uid("it"), platilloId: d2.id, platilloNombre: d2.nombre, cantidad: 1 },
      ],
      estado: "pendiente",
      total: d1.precio * 2 + d2.precio,
    },
    {
      id: uid("ped"),
      clienteNombre: "Don Beto",
      fecha: todayISO(0),
      hora: "09:15",
      items: [{ id: uid("it"), platilloId: d1.id, platilloNombre: d1.nombre, cantidad: 1 }],
      estado: "entregado",
      total: d1.precio,
    },
    {
      id: uid("ped"),
      clienteNombre: "Familia Torres",
      fecha: todayISO(-1),
      hora: "13:00",
      items: [
        { id: uid("it"), platilloId: d1.id, platilloNombre: d1.nombre, cantidad: 3 },
        { id: uid("it"), platilloId: d2.id, platilloNombre: d2.nombre, cantidad: 2 },
      ],
      estado: "entregado",
      total: d1.precio * 3 + d2.precio * 2,
    },
    {
      id: uid("ped"),
      clienteNombre: "Cliente de paso",
      fecha: todayISO(-3),
      hora: "14:20",
      items: [{ id: uid("it"), platilloId: d2.id, platilloNombre: d2.nombre, cantidad: 2 }],
      estado: "entregado",
      total: d2.precio * 2,
    },
  ];

  data.gastos = [
    { id: uid("exp"), categoria: "Gas", monto: 450, fecha: todayISO(-2) },
    { id: uid("exp"), categoria: "Verdura", monto: 320, fecha: todayISO(-1) },
    { id: uid("exp"), categoria: "Carne", monto: 280, fecha: todayISO(0) },
  ];

  return { business, fonda: data };
}

export function generateDemoAbarrotes(form: DemoFormAbarrotes): TenantData {
  const business = createBusiness({
    dueno: form.dueno,
    nombre: form.negocio,
    telefono: form.telefono,
    tipo: "abarrotes",
    demo: true,
  });
  const data = emptyAbarrotesData();

  const p1 = {
    id: uid("gp"),
    nombre: form.producto1 || "Producto escaneado 1",
    codigo: Math.floor(1000000000 + Math.random() * 8999999999).toString(),
    categoria: "General",
    costo: 15,
    precio: 22,
    stock: 12,
    minimo: 5,
    controlCaducidad: false,
    unidad: "pieza" as const,
    lotes: [],
  };
  const p2 = {
    id: uid("gp"),
    nombre: form.producto2 || "Producto escaneado 2",
    codigo: Math.floor(1000000000 + Math.random() * 8999999999).toString(),
    categoria: "General",
    costo: 20,
    precio: 28,
    stock: 8,
    minimo: 5,
    controlCaducidad: false,
    unidad: "pieza" as const,
    lotes: [],
  };
  data.productos = [p1, p2];

  data.ventas = [
    {
      id: uid("sale"),
      items: [
        { id: uid("saleitem"), productoId: p1.id, productoNombre: p1.nombre, cantidad: 2, precioUnitario: p1.precio, subtotal: p1.precio * 2 },
      ],
      total: p1.precio * 2,
      fecha: `${todayISO(0)}T10:15:00`,
    },
  ];

  data.fiados = [
    {
      id: uid("fiado"),
      clienteNombre: "Pedro Ramírez",
      telefono: "3319988776",
      saldo: 350,
      historial: [
        { fecha: todayISO(-10), monto: 200, tipo: "cargo" },
        { fecha: todayISO(-3), monto: 150, tipo: "cargo" },
      ],
    },
  ];

  data.apartados = [
    {
      id: uid("apartado"),
      clienteNombre: "Lupita Hernández",
      telefono: "3317766554",
      producto: "Despensa navideña",
      total: 800,
      abonado: 300,
      fechaLimite: todayISO(14),
      entregado: false,
    },
  ];

  data.gastos = [{ id: uid("exp"), categoria: "Renta", monto: 3500, fecha: todayISO(5), recordatorio: true }];

  return { business, abarrotes: data };
}
