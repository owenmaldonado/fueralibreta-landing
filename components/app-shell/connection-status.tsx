"use client";

import { useOnlineStatus } from "@/lib/use-online-status";
import { useLastSyncLabel } from "@/lib/use-last-sync";

/** Indicador de conexión + última sincronización del TopBar — lee
 * navigator.onLine/eventos online-offline y el timestamp guardado por el
 * caché local (lib/local-cache.ts), no toca sesión ni datos en sí. */
export function ConnectionStatus({ negocioId }: { negocioId?: string }) {
  const online = useOnlineStatus();
  const haceTiempo = useLastSyncLabel(negocioId);

  const label = !online ? "Sin conexión" : haceTiempo ? `Actualizado: ${haceTiempo}` : "En línea";

  return (
    <span
      role="status"
      title={label}
      className={`flex max-w-[104px] shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest ${
        online ? "text-muted-foreground" : "bg-destructive/15 text-destructive"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-ledger" : "bg-destructive"}`}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
