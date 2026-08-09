"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const KEY = "fl_cookie_consent";

/**
 * Aviso de cookies estilo banner, tipo "Usamos cookies para que funcione la
 * app". Se guarda en localStorage para no volver a mostrarse una vez
 * aceptado. Vive en el layout raíz para aparecer en toda la web.
 */
export function ConsentBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      if (!window.localStorage.getItem(KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function aceptar() {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // localStorage no disponible (modo privado, etc.): igual ocultamos el banner.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-border/60 bg-card/95 px-4 py-4 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          Usamos cookies para que funcione la app. Consulta nuestra{" "}
          <Link href="/cookies" className="underline underline-offset-2 hover:text-foreground">
            Política de Cookies
          </Link>
          .
        </p>
        <Button size="sm" onClick={aceptar} className="shrink-0">
          Aceptar
        </Button>
      </div>
    </div>
  );
}
