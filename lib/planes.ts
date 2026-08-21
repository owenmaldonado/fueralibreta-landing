"use client";

import { useSession } from "./session";
import type { BusinessType } from "./types";

/**
 * Definición central de los 3 planes (negocios.plan) — un solo lugar del
 * que cuelgan tanto los límites (cuántos productos, ventas/mes) como las
 * features booleanas (gráficas). Los 3 verticales (barbería/fonda/
 * abarrotes) leen de aquí en vez de cada uno traer su propia copia de
 * "qué puede ver el plan básico".
 */

export type PlanId = "basico" | "pro" | "pro_plus";

export const PLAN_LABELS: Record<PlanId, string> = {
  basico: "Básico",
  pro: "Pro",
  pro_plus: "Pro+",
};

export const PLAN_ORDEN: PlanId[] = ["basico", "pro", "pro_plus"];

/** Precio de lista mensual (MXN) por plan — lo que se muestra como "Precio real" cuando el negocio no tiene un precio_custom congelado. */
export const PLAN_PRECIO_LISTA: Record<PlanId, number> = {
  basico: 199,
  pro: 349,
  pro_plus: 999,
};

/** `null` = sin límite (plan ilimitado en ese renglón). */
export interface PlanLimites {
  max_productos: number | null;
  max_ventas_mes: number | null;
  /** Total de filas activas en negocio_empleados, CONTANDO al dueño (ver app/app/empleados/page.tsx). Básico = 1 (solo el dueño, sin espacio para nadie más), Pro = 5, Pro+ = ilimitado. */
  max_empleados: number | null;
}

export interface PlanFeatures {
  graficas: boolean;
  exportar: boolean;
  multi_caja: boolean;
  realtime: boolean;
  ia: boolean;
  soporte_prioritario: boolean;
}

export interface PlanDef {
  id: PlanId;
  label: string;
  limites: PlanLimites;
  features: PlanFeatures;
}

export const PLANES: Record<PlanId, PlanDef> = {
  basico: {
    id: "basico",
    label: PLAN_LABELS.basico,
    limites: { max_productos: 30, max_ventas_mes: 100, max_empleados: 1 },
    features: { graficas: false, exportar: false, multi_caja: false, realtime: false, ia: false, soporte_prioritario: false },
  },
  pro: {
    id: "pro",
    label: PLAN_LABELS.pro,
    limites: { max_productos: 200, max_ventas_mes: null, max_empleados: 5 },
    features: { graficas: true, exportar: true, multi_caja: false, realtime: true, ia: false, soporte_prioritario: false },
  },
  pro_plus: {
    id: "pro_plus",
    label: PLAN_LABELS.pro_plus,
    limites: { max_productos: null, max_ventas_mes: null, max_empleados: null },
    features: { graficas: true, exportar: true, multi_caja: true, realtime: true, ia: true, soporte_prioritario: true },
  },
};

/** Cualquier valor que no sea uno de los 3 ids conocidos (dato viejo/corrupto) cae a "basico" — nunca a un plan de pago por accidente. */
export function normalizarPlan(valor: string | null | undefined): PlanId {
  return valor === "pro" || valor === "pro_plus" ? valor : "basico";
}

export function planDe(id: PlanId): PlanDef {
  return PLANES[id];
}

export function tieneFeature(planId: PlanId, feature: keyof PlanFeatures): boolean {
  return PLANES[planId].features[feature];
}

/** true si ya alcanzó (o pasó) el límite — un límite `null` nunca se alcanza. */
export function alcanzoLimite(planId: PlanId, limite: keyof PlanLimites, cantidadActual: number): boolean {
  const max = PLANES[planId].limites[limite];
  return max !== null && cantidadActual >= max;
}

/**
 * Plan de ACCESO real: un negocio Fundador ve todo Pro+ sin importar el
 * plan que tiene contratado/facturado (`negocio.plan`) — el trato de
 * Fundador es "acceso completo, precio congelado". Todo lo que llama
 * usePlan() (PlanGate, límites de Inventario/ventas, etc.) ya gatea sobre
 * el resultado de esto, así que ser Fundador cambia comportamiento real,
 * no solo una insignia visual.
 *
 * Trial PRO de cortesía (PR #122, "Activar 7 días PRO" desde /admin): sube
 * `negocio.plan` a "pro" temporalmente SIN registrar `ultimo_pago_at` (eso
 * es lo que distingue un trial de un pago real, ver activarTrialPro en
 * lib/admin-data.ts). Mientras nunca haya pagado de verdad
 * (`ultimoPagoAt == null`) y su trial (el básico de todo registro nuevo, o
 * uno PRO de cortesía) ya venció, el acceso cae solo a "basico" — sin que
 * nadie tenga que tocar `negocio.plan` a mano ni que el negocio se
 * bloquee (ver bloqueadoPorTrial, que solo bloquea a quien SÍ pagó alguna
 * vez y no renovó). Un negocio que nunca pagó y sigue dentro de su trial
 * simplemente ve `negocio.plan` tal cual (básico por default, o pro si el
 * admin le activó el trial de cortesía).
 */
export function planDeAcceso(negocio: { plan: PlanId; esFundador: boolean; trialFin: string; ultimoPagoAt: string | null }): PlanId {
  if (negocio.esFundador) return "pro_plus";
  if (!negocio.ultimoPagoAt && diasParaTrial(negocio.trialFin) < 0) return "basico";
  return negocio.plan;
}

/** Precio real que paga el negocio: su precio_custom congelado si lo tiene, si no el de lista de su plan CONTRATADO (no el de acceso). */
export function precioReal(negocio: { plan: PlanId; precioCustom: number | null }): number {
  return negocio.precioCustom ?? PLAN_PRECIO_LISTA[negocio.plan];
}

/** Días que faltan para que venza el trial (negativo = ya venció). Compara por fecha calendario, sin horas. */
export function diasParaTrial(trialFin: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fin = new Date(`${trialFin}T00:00:00`);
  return Math.round((fin.getTime() - hoy.getTime()) / 86400000);
}

/** Texto corto para la columna/badge de Trial: "Vencido", "Vence hoy" o "N días". */
export function formatTrial(trialFin: string): { texto: string; vencido: boolean } {
  const dias = diasParaTrial(trialFin);
  if (dias < 0) return { texto: "Vencido", vencido: true };
  if (dias === 0) return { texto: "Vence hoy", vencido: false };
  return { texto: `${dias} día${dias === 1 ? "" : "s"}`, vencido: false };
}

/**
 * `trial_fin` es la única fecha de vigencia que existe en el esquema — no
 * hay una columna separada para "cuándo vence el plan de PAGO". En vez de
 * agregar una (plan_expires_at), esta fecha se trata como "acceso bueno
 * hasta" en general: al activar un plan de pago, /admin la reempuja (ver
 * "Activar 30 días" en el menú de acciones), exactamente igual que extender
 * el trial gratuito. Un negocio Fundador nunca se bloquea por esto — el
 * trato de Fundador es acceso completo sin importar fechas.
 *
 * PR #122: solo bloquea a quien YA PAGÓ de verdad alguna vez
 * (`ultimoPagoAt` no nulo) y no renovó — un negocio que nunca ha pagado
 * (su trial básico de siempre, o un trial PRO de cortesía activado desde
 * /admin) NUNCA se bloquea al vencer: solo pierde el acceso extra (ver
 * planDeAcceso) y se queda usando Básico normal.
 */
export function bloqueadoPorTrial(negocio: { trialFin: string; esFundador: boolean; isActive: boolean; ultimoPagoAt: string | null }): boolean {
  if (negocio.esFundador) return false;
  if (!negocio.isActive) return false; // "Pausado" a mano ya tiene su propia pantalla (Cuenta suspendida) — no duplicar el mensaje aquí.
  if (!negocio.ultimoPagoAt) return false;
  return diasParaTrial(negocio.trialFin) < 0;
}

export type EstadoNegocio = "activo" | "por_vencer" | "bloqueado";

/**
 * Para la columna Estado de /admin: 🔴 bloqueado (vencido Y ya pagó alguna
 * vez, o pausado), 🟡 por vencer (≤3 días, mismo requisito de haber
 * pagado), 🟢 el resto — incluyendo, desde PR #122, a quien nunca pagó y su
 * trial (básico o PRO de cortesía) ya venció: ya bajó solo a Básico
 * (planDeAcceso), no hay nada bloqueado que alertar aquí.
 */
export function estadoNegocio(negocio: { trialFin: string; esFundador: boolean; isActive: boolean; ultimoPagoAt: string | null }): EstadoNegocio {
  if (!negocio.isActive) return "bloqueado";
  if (negocio.esFundador) return "activo";
  if (!negocio.ultimoPagoAt) return "activo";
  const dias = diasParaTrial(negocio.trialFin);
  if (dias < 0) return "bloqueado";
  if (dias <= 3) return "por_vencer";
  return "activo";
}

export type EstadoCobranza = "vencido" | "por_vencer" | "trial" | "trial_pro" | "activo";

/**
 * Bucket para los tabs de cobranza de /admin (Negocios) — a quién cobrarle
 * de un vistazo, sin revisar negocio por negocio cada mes. PR #122 separa
 * "trial" (básico, gratis, de todo registro nuevo) de "trial_pro" (acceso
 * Pro de cortesía activado a mano desde /admin, "Activar 7 días PRO") —
 * ninguno de los dos es nunca urgente cobrarle (nunca pagaron), así que
 * ninguno cae en "vencido"/"por_vencer" sin importar cuántos días falten o
 * hayan pasado. "vencido"/"por_vencer"/"activo" solo aplican a quien SÍ
 * pagó alguna vez — ahí sí importa la fecha real de renovación.
 */
export function estadoCobranza(negocio: { trialFin: string; esFundador: boolean; isActive: boolean; plan: PlanId; ultimoPagoAt: string | null }): EstadoCobranza {
  if (negocio.esFundador) return "activo";
  if (!negocio.isActive) return "vencido";
  if (!negocio.ultimoPagoAt) return negocio.plan === "basico" ? "trial" : "trial_pro";
  const dias = diasParaTrial(negocio.trialFin);
  if (dias < 0) return "vencido";
  if (dias <= 3) return "por_vencer";
  return "activo";
}

/**
 * Mensaje de WhatsApp para el botón "Recordatorio" de un negocio por vencer
 * o ya vencido — precio y plan reales de SU giro (PRECIOS_POR_GIRO), no un
 * precio genérico, para no tener que escribirlo a mano cada vez.
 */
export function mensajeRecordatorioCobranza(negocio: { tipo: BusinessType; plan: PlanId; precioCustom: number | null; trialFin: string }): string {
  const precio = precioPorGiro(negocio);
  const vence = new Date(`${negocio.trialFin}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
  return `Hola! Tu plan de FueraLibreta vence el ${vence}. ¿Renovamos ${PLAN_LABELS[negocio.plan]} $${precio} por 30 días más?`;
}

/**
 * Lee el plan del negocio activo (session.business.plan/esFundador,
 * reactivo — ver el canal de realtime de "negocios" en lib/session.ts: un
 * cambio hecho desde /admin llega aquí solo, sin F5) y expone
 * can()/limiteAlcanzado() para que cada pantalla decida qué mostrar en vez
 * de tener el mapa de features regado por todos lados.
 *
 * `plan` es el plan de ACCESO (ya considera Fundador) — es lo que gatea
 * features/límites de verdad. `planContratado` es el que se factura, para
 * pantallas que necesiten mostrar ambos por separado (ej. /admin).
 *
 * Sin sesión resuelta todavía (ready=false) cae a "basico" — nunca muestra
 * de más mientras carga.
 */
export function usePlan() {
  const { session } = useSession();
  const planContratado = normalizarPlan(session?.business.plan);
  const esFundador = session?.business.esFundador ?? false;
  const esDemo = session?.business.demo ?? false;
  const trialFin = session?.business.trial_fin ?? "";
  const ultimoPagoAt = session?.business.ultimoPagoAt ?? null;
  const planId = planDeAcceso({ plan: planContratado, esFundador, trialFin, ultimoPagoAt });
  const def = PLANES[planId];

  // TEMPORAL: gráficas destapadas para demo y para Básico — sin bloqueos de
  // plan todavía en este renglón mientras se define qué queda exclusivo de
  // Pro/Pro+. Si lo ve el demo, lo ve Básico. No toca límites
  // (max_productos/max_ventas_mes) ni el resto de features: eso sigue igual.
  const graficasDestapadas = esDemo || planContratado === "basico";

  // Una demo (createBusiness() en lib/mock.ts la arma siempre con
  // plan:"basico") es una demo DE VENTA: tiene que enseñar el techo del
  // producto (gráfica completa, reservas, editor de ventas...) a un
  // prospecto, no quedarse trabada en los límites de básico como si fuera
  // un negocio real que nunca pagó. Por eso los límites POR GIRO (a
  // diferencia de `limites`/`features`, que siguen el plan tal cual) se
  // resuelven en el techo (Pro+) cuando es demo.
  const planIdGiro = esDemo ? "pro_plus" : planId;

  return {
    plan: planId,
    planContratado,
    esFundador,
    label: def.label,
    limites: def.limites,
    features: def.features,
    can: (feature: keyof PlanFeatures) => (feature === "graficas" && graficasDestapadas ? true : def.features[feature]),
    limiteAlcanzado: (limite: keyof PlanLimites, cantidadActual: number) => alcanzoLimite(planId, limite, cantidadActual),
    // Límites/precio propios del giro del negocio activo (ver LIMITES_* /
    // PRECIOS_POR_GIRO abajo) — ya resueltos sobre el plan de ACCESO
    // (Fundador incluido) y sobre el override de demo de arriba, para no
    // repetir esa lógica en cada pantalla.
    giroAbarrotes: LIMITES_ABARROTES[planIdGiro],
    giroBarberia: LIMITES_BARBERIA[planIdGiro],
    giroFonda: LIMITES_FONDA[planIdGiro],
  };
}

// ============================================================================
// Precios y límites POR GIRO — abarrotera/barbería/fondita cobran distinto y
// limitan cosas distintas (ej. "clientes" no existe en abarrotes, "productos"
// no existe en barbería). Viven aparte de PLANES/PLAN_PRECIO_LISTA (que son
// el precio de LISTA plano, todavía usado como fallback de precioReal() para
// cualquier código que no sepa el giro) — /planes, /planes-bloqueado y
// BloqueoPlan sí resuelven según BusinessType.
// ============================================================================

/** Precio mensual (MXN) por giro y plan — lo que se muestra en /planes. */
export const PRECIOS_POR_GIRO: Record<BusinessType, Record<PlanId, number>> = {
  abarrotes: { basico: 199, pro: 349, pro_plus: 649 },
  barberia: { basico: 349, pro: 599, pro_plus: 999 },
  fonda: { basico: 249, pro: 449, pro_plus: 749 },
};

/** Precio real del giro: precio_custom congelado si lo tiene, si no el de lista de SU giro y plan contratado. */
export function precioPorGiro(negocio: { tipo: BusinessType; plan: PlanId; precioCustom: number | null }): number {
  return negocio.precioCustom ?? PRECIOS_POR_GIRO[negocio.tipo][negocio.plan];
}

export interface LimitesAbarrotes {
  maxProductos: number | null;
  maxCuentas: number | null;
  recordatorio: boolean;
  editor: boolean;
  grafica: "semanal" | "anual";
}

export const LIMITES_ABARROTES: Record<PlanId, LimitesAbarrotes> = {
  basico: { maxProductos: 200, maxCuentas: 1, recordatorio: false, editor: false, grafica: "semanal" },
  pro: { maxProductos: null, maxCuentas: 3, recordatorio: true, editor: true, grafica: "anual" },
  pro_plus: { maxProductos: null, maxCuentas: 8, recordatorio: true, editor: true, grafica: "anual" },
};

export interface LimitesBarberia {
  maxClientes: number | null;
  maxServicios: number | null;
  maxCuentas: number | null;
  msg28: boolean;
  grafica: "ventas" | "completa";
  /** No venía en la tabla de límites original — se agrega porque el spec sí pide bloquear "Excepciones" (vacaciones/días especiales) por plan. básico no, Pro/Pro+ sí. */
  excepciones: boolean;
  /** "Link de reservas" (booking público en /b/[slug]) — solo Pro+ según BENEFICIOS_POR_GIRO.barberia.pro_plus. Básico y Pro no lo tenían listado como beneficio. */
  reservas: boolean;
  /** Citas por mes calendario (se cuenta por fecha, no acumulado histórico). `null` = sin límite. */
  maxCitas: number | null;
}

export const LIMITES_BARBERIA: Record<PlanId, LimitesBarberia> = {
  basico: { maxClientes: 100, maxServicios: 20, maxCuentas: 1, msg28: false, grafica: "ventas", excepciones: false, reservas: false, maxCitas: 100 },
  // reservas ahora también en Pro (antes solo Pro+) — Owen lo confirmó como
  // beneficio real de Pro, no exclusivo de Pro+.
  pro: { maxClientes: null, maxServicios: null, maxCuentas: 5, msg28: true, grafica: "completa", excepciones: true, reservas: true, maxCitas: null },
  pro_plus: { maxClientes: null, maxServicios: null, maxCuentas: 10, msg28: true, grafica: "completa", excepciones: true, reservas: true, maxCitas: null },
};

export interface LimitesFonda {
  variantes: boolean;
  mesas: number | null;
  /** Catálogo total (platillos activos + no disponibles/historial). `null` = sin límite. */
  maxProductos: number | null;
  /**
   * Cuántos platillos pueden estar "disponible hoy" AL MISMO TIEMPO. Antes
   * (PR #119) el toggle diario completo se bloqueaba en básico detrás de un
   * candado a /planes — impedía incluso marcar algo como agotado sin borrar
   * y recrear el platillo. Ahora SOLO se gatea activar un platillo cuando ya
   * se llegó a este tope; desactivar (marcarlo "no disponible hoy") siempre
   * es libre, sin importar el plan ni cuántos haya en el historial. `null` =
   * sin límite.
   */
  maxProductosActivos: number | null;
  comandas: boolean;
  /** Mismo criterio que giroAbarrotes.grafica: básico solo ve el rango Semanal en /app/gastos, Mensual/Anual quedan detrás de BloqueoPlan. */
  grafica: "semanal" | "anual";
  /** Pedidos por mes calendario (se cuenta por fecha, no acumulado histórico). `null` = sin límite. */
  maxPedidos: number | null;
}

export const LIMITES_FONDA: Record<PlanId, LimitesFonda> = {
  basico: { variantes: false, mesas: 1, maxProductos: 100, maxProductosActivos: 45, comandas: false, grafica: "semanal", maxPedidos: 100 },
  pro: { variantes: true, mesas: null, maxProductos: 500, maxProductosActivos: null, comandas: false, grafica: "anual", maxPedidos: null },
  pro_plus: { variantes: true, mesas: null, maxProductos: null, maxProductosActivos: null, comandas: true, grafica: "anual", maxPedidos: null },
};

/** Beneficios en texto plano por giro — alimenta las cards de /planes y /planes-bloqueado sin repetir la lista a mano en 3 lugares. */
export const BENEFICIOS_POR_GIRO: Record<BusinessType, Record<PlanId, string[]>> = {
  abarrotes: {
    basico: ["Hasta 200 productos", "1 cuenta", "Gráfica semanal"],
    pro: ["Productos ilimitados", "3 cuentas", "Gráfica anual", "Recordatorios de cobro", "Editor de ventas"],
    pro_plus: ["Productos ilimitados", "8 cuentas", "Gráfica anual", "Recordatorios de cobro", "Editor de ventas", "Exportar a Excel"],
  },
  barberia: {
    basico: ["Hasta 100 clientes", "Hasta 20 servicios", "Hasta 100 citas/mes", "1 cuenta", "Gráfica de ventas"],
    pro: ["Clientes ilimitados", "Servicios ilimitados", "Citas ilimitadas", "5 cuentas", "Gráfica completa", "Mensaje a 28 días sin venir", "Reservas en línea"],
    pro_plus: ["Clientes ilimitados", "Servicios ilimitados", "Citas ilimitadas", "10 cuentas", "Gráfica completa", "Mensaje a 28 días sin venir", "Reservas en línea"],
  },
  fonda: {
    basico: ["Hasta 100 productos", "Hasta 100 pedidos/mes", "1 mesa a la vez"],
    pro: ["Hasta 500 productos", "Pedidos ilimitados", "Variantes de platillo", "Carrito por mesa"],
    pro_plus: ["Productos ilimitados", "Pedidos ilimitados", "Variantes de platillo", "Carrito por mesa", "Comandas para cocina"],
  },
};
