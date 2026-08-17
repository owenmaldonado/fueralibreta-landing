import { todayISO } from "./mock";

/**
 * "Ignorar por hoy" en las cards de pendientes de Hoy (ver ActionCard +
 * abarrotes-dashboard.tsx / barberia-dashboard.tsx). Vive en localStorage,
 * una llave por fecha — no un TTL a mano: el aviso simplemente deja de
 * filtrarse en cuanto cambia el día, porque avisosIgnoradosHoy() solo lee
 * la entrada de HOY. Cada escritura además tira las fechas viejas (nadie
 * las vuelve a leer), así que esto nunca crece sin límite.
 */
const KEY = "dismissed_alerts_hoy";

function leer(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { fecha?: string; ids?: string[] };
    return parsed.fecha === todayISO(0) && Array.isArray(parsed.ids) ? parsed.ids : [];
  } catch {
    return [];
  }
}

export function avisosIgnoradosHoy(): Set<string> {
  return new Set(leer());
}

export function ignorarAvisoHoy(id: string) {
  if (typeof window === "undefined") return;
  const actuales = new Set(leer());
  actuales.add(id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ fecha: todayISO(0), ids: Array.from(actuales) }));
  } catch {
    // localStorage no disponible (modo privado estricto, etc.) — el aviso
    // simplemente no se recuerda ignorado, sin tronar la pantalla.
  }
}
