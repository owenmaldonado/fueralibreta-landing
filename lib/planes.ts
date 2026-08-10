import { todayISO } from "./mock";
import type { Business, PlanNegocio, EstadoNegocio } from "./types";

// ============================================================================
// Módulo central de planes: un solo lugar que responde "¿puede usar X este
// negocio?". Esto es la capa de UI/UX (para no mostrar botones que de todos
// modos van a fallar) — la última palabra la tiene RLS en Supabase
// (negocio_esta_habilitado / is_negocio_habilitado en supabase.sql), que
// bloquea aunque alguien se salte esta función pegándole directo a la API.
// ============================================================================

export interface LimitesPlan {
  /** null = sin límite (empleados ilimitados). */
  maxEmpleados: number | null;
  reportes: boolean;
  auditoria: boolean;
  offline: boolean;
}

export const LIMITES_POR_PLAN: Record<PlanNegocio, LimitesPlan> = {
  basico: { maxEmpleados: 1, reportes: false, auditoria: false, offline: false },
  pro: { maxEmpleados: 5, reportes: true, auditoria: true, offline: false },
  pro_plus: { maxEmpleados: null, reportes: true, auditoria: true, offline: true },
};

/** Features booleanas de LimitesPlan (todo excepto el límite numérico de empleados). */
export type FeatureBooleana = "reportes" | "auditoria" | "offline";

type NegocioPlan = Pick<Business, "plan" | "estado" | "fechaVencimiento">;

/**
 * Recalcula el estado real del negocio: si en la base sigue marcado "prueba"
 * pero fechaVencimiento ya pasó, es tan suspendido como si alguien lo
 * hubiera marcado a mano — no depende de que corra ningún cron (mismo
 * cálculo que negocio_esta_habilitado() en Postgres, para que frontend y RLS
 * nunca se contradigan).
 */
export function estadoEfectivo(negocio: NegocioPlan): EstadoNegocio {
  if (negocio.estado === "prueba" && negocio.fechaVencimiento && negocio.fechaVencimiento < todayISO()) {
    return "suspendido";
  }
  return negocio.estado;
}

export function estaSuspendido(negocio: NegocioPlan): boolean {
  return estadoEfectivo(negocio) === "suspendido";
}

/**
 * Días que faltan para que venza la prueba. null si no aplica (no está en
 * prueba, o no tiene fecha de corte). Puede salir negativo si ya venció.
 */
export function diasRestantesPrueba(negocio: NegocioPlan): number | null {
  if (negocio.estado !== "prueba" || !negocio.fechaVencimiento) return null;
  const msPorDia = 24 * 60 * 60 * 1000;
  const hoy = new Date(`${todayISO()}T00:00:00`).getTime();
  const vencimiento = new Date(`${negocio.fechaVencimiento}T00:00:00`).getTime();
  return Math.round((vencimiento - hoy) / msPorDia);
}

/** ¿Este negocio puede usar esta feature (booleana) ahora mismo? */
export function puedeUsar(negocio: NegocioPlan, feature: FeatureBooleana): boolean {
  if (estaSuspendido(negocio)) return false;
  return LIMITES_POR_PLAN[negocio.plan][feature];
}

/** Para el límite numérico (hoy solo empleados): ¿cabe uno más? */
export function dentroDelLimiteEmpleados(negocio: NegocioPlan, empleadosActuales: number): boolean {
  if (estaSuspendido(negocio)) return false;
  const limite = LIMITES_POR_PLAN[negocio.plan].maxEmpleados;
  return limite === null || empleadosActuales < limite;
}
