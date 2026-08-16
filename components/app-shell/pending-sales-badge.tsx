"use client";

import { usePendingSalesQueue } from "@/lib/offline-sales-queue";

/** "N ventas sin subir" — visible y permanente en el TopBar mientras haya
 * algo en la cola (Parte 3 de PWA); no ocupa espacio cuando está vacía. */
export function PendingSalesBadge({ negocioId }: { negocioId?: string }) {
  const { count } = usePendingSalesQueue(negocioId);

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
