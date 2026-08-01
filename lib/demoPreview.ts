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
