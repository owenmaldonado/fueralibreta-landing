"use client";

import { useSession } from "./session";

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
    limites: { max_productos: 30, max_ventas_mes: 100 },
    features: { graficas: false, exportar: false, multi_caja: false, realtime: false, ia: false, soporte_prioritario: false },
  },
  pro: {
    id: "pro",
    label: PLAN_LABELS.pro,
    limites: { max_productos: 200, max_ventas_mes: null },
    features: { graficas: true, exportar: true, multi_caja: false, realtime: true, ia: false, soporte_prioritario: false },
  },
  pro_plus: {
    id: "pro_plus",
    label: PLAN_LABELS.pro_plus,
    limites: { max_productos: null, max_ventas_mes: null },
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
 * plan que tiene contratado/facturado (`planContratado`) — el trato de
 * Fundador es "acceso completo, precio congelado". Todo lo que llama
 * usePlan() (PlanGate, límites de Inventario/ventas, etc.) ya gatea sobre
 * el resultado de esto, así que ser Fundador cambia comportamiento real,
 * no solo una insignia visual.
 */
export function planDeAcceso(planContratado: PlanId, esFundador: boolean): PlanId {
  return esFundador ? "pro_plus" : planContratado;
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
  const planId = planDeAcceso(planContratado, esFundador);
  const def = PLANES[planId];

  // TEMPORAL: gráficas destapadas para demo y para Básico — sin bloqueos de
  // plan todavía en este renglón mientras se define qué queda exclusivo de
  // Pro/Pro+. Si lo ve el demo, lo ve Básico. No toca límites
  // (max_productos/max_ventas_mes) ni el resto de features: eso sigue igual.
  const graficasDestapadas = esDemo || planContratado === "basico";

  return {
    plan: planId,
    planContratado,
    esFundador,
    label: def.label,
    limites: def.limites,
    features: def.features,
    can: (feature: keyof PlanFeatures) => (feature === "graficas" && graficasDestapadas ? true : def.features[feature]),
    limiteAlcanzado: (limite: keyof PlanLimites, cantidadActual: number) => alcanzoLimite(planId, limite, cantidadActual),
  };
}
