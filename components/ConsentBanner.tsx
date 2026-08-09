"use client";

import * as React from "react";
import Link from "next/link";

import { readConsent, writeConsent } from "@/lib/consent";

/**
 * Modal de cookies obligatorio: cubre toda la pantalla (overlay con
 * backdrop-blur) y bloquea el scroll del body hasta que el usuario acepta.
 * No se cierra con click afuera, solo con el botón. Montado una sola vez
 * en app/layout.tsx.
 */
export function ConsentBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    setVisible(readConsent() !== "accepted");
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = visible ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  function aceptar() {
    writeConsent("accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-banner-title"
    >
      <div className="w-[90%] max-w-md rounded-2xl bg-white p-8 text-center text-black shadow-2xl">
        <h2 id="consent-banner-title" className="text-2xl font-bold tracking-tight">
          🍪 Usamos Cookies
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-black/80">
          Usamos cookies necesarias para que Fuera Libreta funcione. Al
          continuar aceptas nuestro{" "}
          <Link
            href="/aviso-privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-amber-700 underline underline-offset-2"
          >
            Aviso de Privacidad
          </Link>{" "}
          y{" "}
          <Link
            href="/terminos"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-amber-700 underline underline-offset-2"
          >
            Términos
          </Link>
          .
        </p>

        <button
          type="button"
          onClick={aceptar}
          className="mt-6 h-12 w-full rounded-md bg-black text-base font-bold text-white transition-colors hover:bg-black/85"
        >
          Aceptar y continuar
        </button>
      </div>
    </div>
  );
}
