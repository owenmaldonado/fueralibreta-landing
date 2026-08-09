"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const CONSENT_KEY = "consent";

/**
 * Aviso de cookies tipo toast que aparece la primera vez que alguien visita
 * el sitio. Se guarda `localStorage.consent = "true"` para no volver a
 * mostrarse una vez aceptado. Montado en app/layout.tsx para vivir en toda
 * la web.
 */
export function ConsentBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(CONSENT_KEY) !== "true") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function aceptar() {
    try {
      window.localStorage.setItem(CONSENT_KEY, "true");
    } catch {
      // localStorage no disponible (modo privado, etc.): igual ocultamos el banner.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:justify-between">
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          Usamos cookies para que funcione la app.{" "}
          <Link href="/cookies" className="underline underline-offset-2 hover:text-foreground">
            Política de Cookies
          </Link>
        </p>
        <Button size="sm" onClick={aceptar} className="shrink-0">
          Aceptar
        </Button>
      </div>
    </div>
  );
}
