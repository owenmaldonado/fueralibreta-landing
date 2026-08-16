"use client";

import { useEffect } from "react";

import { useOnlineStatus } from "@/lib/use-online-status";
import { sincronizarColaPendiente } from "@/lib/sync-queue";

const INTERVALO_RESPALDO_MS = 2 * 60 * 1000;

/**
 * Dispara la subida de la cola pendiente (Parte 4 de PWA) — nunca renderiza
 * nada. sincronizarColaPendiente() ya se protege sola (no hace nada si no
 * hay conexión, si la cola está vacía, o si ya hay un ciclo corriendo para
 * este negocio), así que aquí solo hace falta darle ganas de intentarlo en
 * los momentos donde tiene sentido:
 * - Al reconectar (o al montar, si ya hay señal) — el caso principal.
 * - Al volver a la pestaña (visibilitychange/focus) — por si el primer
 *   intento al reconectar falló (la pestaña estaba en segundo plano).
 * - Cada 2 minutos de respaldo mientras haya señal — por si el intento de
 *   arriba también falló y nadie volvió a tocar la pestaña.
 *
 * Nunca corre en modo demo: no hay negocio real en Postgres al que subirle nada.
 */
export function SalesSyncManager({ negocioId, demo }: { negocioId: string; demo: boolean }) {
  const online = useOnlineStatus();

  useEffect(() => {
    if (demo || !online) return;
    sincronizarColaPendiente(negocioId);
  }, [online, negocioId, demo]);

  useEffect(() => {
    if (demo) return;
    function alVolver() {
      if (document.visibilityState === "visible" && navigator.onLine) {
        sincronizarColaPendiente(negocioId);
      }
    }
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [negocioId, demo]);

  useEffect(() => {
    if (demo) return;
    const interval = setInterval(() => {
      if (navigator.onLine) sincronizarColaPendiente(negocioId);
    }, INTERVALO_RESPALDO_MS);
    return () => clearInterval(interval);
  }, [negocioId, demo]);

  return null;
}
