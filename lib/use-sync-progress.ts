"use client";

import { useEffect, useState } from "react";

import { SYNC_PROGRESS_EVENT, progresoDeSincronizacion, type SyncProgreso } from "./sync-queue";

/** "Subiendo X de Y..." del TopBar — refleja el progreso en vivo de sincronizarColaPendiente(). */
export function useSyncProgress(negocioId: string | undefined): SyncProgreso | null {
  const [progreso, setProgreso] = useState<SyncProgreso | null>(null);

  useEffect(() => {
    if (!negocioId) {
      setProgreso(null);
      return;
    }
    setProgreso(progresoDeSincronizacion(negocioId));

    function onEvento(e: Event) {
      const detalle = (e as CustomEvent<SyncProgreso | null>).detail;
      setProgreso(detalle && detalle.negocioId === negocioId ? detalle : null);
    }
    window.addEventListener(SYNC_PROGRESS_EVENT, onEvento);
    return () => window.removeEventListener(SYNC_PROGRESS_EVENT, onEvento);
  }, [negocioId]);

  return progreso;
}
