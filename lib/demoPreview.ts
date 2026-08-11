"use client";

import type { TenantData } from "./types";

const KEY = "fl_demo_preview";
const EVENT = "fl_demo_preview_change";

/**
 * Vista previa de demo antes de iniciar sesión (/demo/[tipo] -> /app en modo
 * demo -> "Lo quiero" -> /login -> /onboarding la activa con persistTenant()).
 * Vive en localStorage porque todavía no hay un usuario autenticado al que
 * asociarle un negocio real en Supabase; una vez activada, esta clave se
 * limpia y el negocio pasa a vivir en la base de datos.
 */
export function readDemoPreview(): TenantData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TenantData) : null;
  } catch {
    return null;
  }
}

export function writeDemoPreview(data: TenantData | null): void {
  if (typeof window === "undefined") return;
  if (data === null) {
    window.localStorage.removeItem(KEY);
  } else {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearDemoPreview(): void {
  writeDemoPreview(null);
}

export const DEMO_PREVIEW_EVENT = EVENT;

const PLAN_KEY = "fl_plan_elegido";

export interface PlanElegido {
  plan: string;
  precio: number;
}

/**
 * Marca que el usuario vino del botón "Lo quiero" del banner de demo (antes
 * de loguearse). Es señal de control de flujo para /onboarding — cuando
 * está presente, /onboarding SIEMPRE crea un negocio en blanco (nunca
 * ofrece "activar" el fl_demo_preview tal cual) y la borra en cuanto el
 * negocio queda creado. No es un plan de facturación real: profiles.plan
 * (lib/admin-data.ts) es un campo aparte que solo el panel /admin escribe;
 * esto es puramente informativo para el flujo de alta.
 */
export function readPlanElegido(): PlanElegido | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as PlanElegido) : null;
  } catch {
    return null;
  }
}

export function writePlanElegido(plan: PlanElegido): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}

export function clearPlanElegido(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLAN_KEY);
}
