"use client";

import { useOnlineStatus } from "@/lib/use-online-status";

/** Indicador de conexión del TopBar — solo lee navigator.onLine/eventos
 * online-offline, no toca sesión ni datos (ver alcance de la tarea). */
export function ConnectionStatus() {
  const online = useOnlineStatus();

  return (
    <span
      role="status"
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest ${
        online ? "text-muted-foreground" : "bg-destructive/15 text-destructive"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-ledger" : "bg-destructive"}`}
      />
      {online ? "En línea" : "Sin conexión"}
    </span>
  );
}
