"use client";

import { useEffect, useReducer, useState } from "react";

import { leerUltimaSincronizacion } from "./local-cache";

function formatearHaceTiempo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD} d`;
}

/** "Actualizado: hace 2 min" para el indicador discreto del TopBar — relee
 * el timestamp cada 30s (por si hubo una sincronización nueva) y fuerza un
 * re-render en el mismo intervalo para que el texto relativo no se quede
 * pegado aunque el timestamp guardado no haya cambiado. */
export function useLastSyncLabel(negocioId: string | undefined): string | null {
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [, forceTick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!negocioId) return;
    let cancelled = false;

    function refrescar() {
      leerUltimaSincronizacion(negocioId!).then((v) => {
        if (!cancelled) setLastSync(v);
      });
    }

    refrescar();
    const interval = setInterval(() => {
      refrescar();
      forceTick();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [negocioId]);

  return lastSync ? formatearHaceTiempo(lastSync) : null;
}
