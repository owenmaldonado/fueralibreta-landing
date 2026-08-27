

/**
 * "Ignorar por hoy" en las cards de pendientes de Hoy (ver ActionCard +
 * abarrotes-dashboard.tsx / barberia-dashboard.tsx). Vive en localStorage,
 * una llave por NEGOCIO (dismissed_hoy_{negocio_id}) — así un dispositivo
 * que haya visto más de un negocio (demo, multicuenta) no mezcla los
 * avisos ignorados de uno con los de otro. Dentro de esa llave, el valor
 * trae su propia fecha — no un TTL a mano: el aviso simplemente deja de
 * filtrarse en cuanto cambia el día, porque avisosIgnoradosHoy() solo lee
 * la entrada de HOY. Cada escritura además tira las fechas viejas (nadie
 * las vuelve a leer), así que esto nunca crece sin límite.
 *
 * `hoy` se recibe por parámetro (el día del NEGOCIO, ver hoyEnZona /
 * lib/use-hoy.ts) en vez de calcularlo aquí con todayISO(0), que es el día
 * del DISPOSITIVO: los dashboards que llaman a esto ya filtran sus avisos
 * contra el día del negocio, así que calcularlo distinto aquí hacía que un
 * aviso ignorado reapareciera (o siguiera oculto) a una hora que no era la
 * medianoche del negocio.
 */
function storageKey(negocioId: string): string {
  return `dismissed_hoy_${negocioId}`;
}

function leer(negocioId: string, hoy: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(negocioId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { fecha?: string; ids?: string[] };
    return parsed.fecha === hoy && Array.isArray(parsed.ids) ? parsed.ids : [];
  } catch {
    return [];
  }
}

export function avisosIgnoradosHoy(negocioId: string, hoy: string): Set<string> {
  return new Set(leer(negocioId, hoy));
}

export function ignorarAvisoHoy(negocioId: string, id: string, hoy: string) {
  if (typeof window === "undefined") return;
  const actuales = new Set(leer(negocioId, hoy));
  actuales.add(id);
  try {
    window.localStorage.setItem(storageKey(negocioId), JSON.stringify({ fecha: hoy, ids: Array.from(actuales) }));
  } catch {
    // localStorage no disponible (modo privado estricto, etc.) — el aviso
    // simplemente no se recuerda ignorado, sin tronar la pantalla.
  }
}
