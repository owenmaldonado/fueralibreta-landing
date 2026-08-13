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
 * Lee el plan del negocio activo (session.business.plan, reactivo — ver el
 * canal de realtime de "negocios" en lib/session.ts: un cambio de plan
 * hecho desde /admin llega aquí solo, sin F5) y expone can()/limiteAlcanzado()
 * para que cada pantalla decida qué mostrar en vez de tener el mapa de
 * features regado por todos lados.
 *
 * Sin sesión resuelta todavía (ready=false) cae a "basico" — nunca muestra
 * de más mientras carga.
 */
export function usePlan() {
  const { session } = useSession();
  const planId = normalizarPlan(session?.business.plan);
  const def = PLANES[planId];

  return {
    plan: planId,
    label: def.label,
    limites: def.limites,
    features: def.features,
    can: (feature: keyof PlanFeatures) => def.features[feature],
    limiteAlcanzado: (limite: keyof PlanLimites, cantidadActual: number) => alcanzoLimite(planId, limite, cantidadActual),
  };
}
