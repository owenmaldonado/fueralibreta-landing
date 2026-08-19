"use client";

/**
 * Turno actual de la fonda (Bug 9: "Ventas" de Hoy se veía en $0 tras un
 * refresh — se calculaba filtrando session.fonda.pedidos por `fecha`, y un
 * hard refresh pinta primero desde el catálogo local vacío de pedidos
 * antes de que llegue la carga real, ver lib/local-cache.ts). turno_id
 * agrupa los pedidos del turno en curso del negocio: se abre solo al
 * vender el primero (o se crea a mano si no existe) y vive en
 * localStorage, no en useState — así sobrevive cualquier refresh sin
 * importar en qué momento se recargó la sesión. Solo se borra al
 * "Cerrar turno" (ver cerrarTurno(), llamado desde
 * components/dashboards/fonda-cerrar-turno.tsx), que es el único punto
 * donde de verdad debe reiniciarse el contador de Hoy.
 */

const TURNO_KEY_PREFIX = "fl_turno_actual_fonda_";

export interface TurnoActual {
  turnoId: string;
  abiertoEn: string; // ISO
}

function claveTurno(negocioId: string): string {
  return `${TURNO_KEY_PREFIX}${negocioId}`;
}

export function leerTurnoActual(negocioId: string): TurnoActual | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(claveTurno(negocioId));
    if (!raw) return null;
    const turno = JSON.parse(raw) as Partial<TurnoActual>;
    return turno.turnoId && turno.abiertoEn ? (turno as TurnoActual) : null;
  } catch {
    return null;
  }
}

function abrirTurno(negocioId: string): TurnoActual {
  const turno: TurnoActual = { turnoId: crypto.randomUUID(), abiertoEn: new Date().toISOString() };
  try {
    localStorage.setItem(claveTurno(negocioId), JSON.stringify(turno));
  } catch {
    // localStorage bloqueado/lleno: el turno igual se usa para este pedido
    // (queda en memoria), solo no persiste entre refrescos.
  }
  return turno;
}

/** Lee el turno en curso o abre uno nuevo si no hay — para tagear un pedido nuevo (venta rápida o Nuevo Pedido) con su turno_id. */
export function obtenerOCrearTurno(negocioId: string): TurnoActual {
  return leerTurnoActual(negocioId) ?? abrirTurno(negocioId);
}

/** Llamar al terminar "Cerrar turno" — el próximo pedido abre un turno nuevo. */
export function cerrarTurno(negocioId: string): void {
  try {
    localStorage.removeItem(claveTurno(negocioId));
  } catch {
    // No hay nada que limpiar si ya estaba bloqueado/vacío.
  }
}
