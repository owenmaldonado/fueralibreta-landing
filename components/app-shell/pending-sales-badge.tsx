"use client";

import { usePendingSalesQueue } from "@/lib/offline-sales-queue";
import { useSyncProgress } from "@/lib/use-sync-progress";

/** "N ventas sin subir" (Parte 3) / "Subiendo X de Y..." mientras sincroniza
 * (Parte 4) — visible y permanente en el TopBar mientras haya algo en la
 * cola; no ocupa espacio cuando está vacía. */
export function PendingSalesBadge({ negocioId }: { negocioId?: string }) {
  const { count } = usePendingSalesQueue(negocioId);
  const progreso = useSyncProgress(negocioId);

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

  if (count === 0) return null;

  return (
    <span
      role="status"
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary"
    >
      {count} {count === 1 ? "venta sin subir" : "ventas sin subir"}
    </span>
  );
}
