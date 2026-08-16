"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useOnlineStatus } from "@/lib/use-online-status";

/** Aviso al entrar en modo sin conexión (Parte 3 de PWA) — se puede volver a
 * disparar si la señal se cae otra vez más tarde en la misma sesión. */
export function OfflineSalesNotice() {
  const online = useOnlineStatus();
  const avisadoRef = useRef(false);

  useEffect(() => {
    if (!online && !avisadoRef.current) {
      avisadoRef.current = true;
      toast.info("Sin conexión — puedes seguir vendiendo, se guardará");
    }
    if (online) {
      avisadoRef.current = false;
    }
  }, [online]);

  return null;
}
