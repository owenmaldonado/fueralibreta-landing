"use client";

import { usePendingSalesQueue } from "@/lib/offline-sales-queue";
import { useSyncProgress } from "@/lib/use-sync-progress";

/**
 * Estado de la cola de ventas sin subir, en el TopBar.
 *
 * Distingue dos cosas que antes se veían IGUAL, y esa era justo la queja de
 * "se queda en enviando pendientes para siempre":
 *
 * - Pendientes: esperan señal. Se van solas en cuanto vuelve el internet.
 * - Con problema: el servidor las RECHAZÓ (estado "error"). El ciclo de
 *   sincronización las salta a propósito (ver sincronizarColaPendiente), así
 *   que por más señal que haya nunca se van solas — necesitan Reintentar o
 *   Descartar a mano desde la lista de ventas. Contarlas como "sin subir",
 *   en el mismo color, hacía parecer que la app estaba atorada subiendo algo
 *   cuando en realidad estaba esperando a que alguien las revisara.
 */
export function PendingSalesBadge({ negocioId }: { negocioId?: string }) {
  const { rows } = usePendingSalesQueue(negocioId);
  const progreso = useSyncProgress(negocioId);

  const conError = rows.filter((r) => r.estado === "error").length;
  const esperando = rows.length - conError;

  if (progreso) {
    return (
      <span
        role="status"
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary"
      >
        Subiendo {progreso.actual} de {progreso.total}...
      </span>
    );
  }

  if (conError > 0) {
    return (
      <span
        role="status"
        title="El servidor rechazó estas ventas — revísalas en tu lista de ventas para reintentar o descartar"
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-destructive/15 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-destructive"
      >
        {conError} {conError === 1 ? "venta" : "ventas"} por revisar
      </span>
    );
  }

  if (esperando === 0) return null;

  return (
    <span
      role="status"
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary"
    >
      {esperando} {esperando === 1 ? "venta sin subir" : "ventas sin subir"}
    </span>
  );
}
