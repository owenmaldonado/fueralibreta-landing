"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { readConsent, writeConsent } from "@/lib/consent";

/**
 * Modal de cookies obligatorio: bloquea toda la web (overlay a pantalla
 * completa, sin cerrar al hacer click afuera) hasta que el usuario decida.
 * Solo desaparece de forma permanente si acepta — reaparece en cada
 * navegación mientras no haya un "accepted" guardado, incluso si antes
 * rechazó.
 */
export function ConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    setVisible(readConsent() !== "accepted");
  }, [pathname]);

  function aceptar() {
    writeConsent("accepted");
    setVisible(false);
  }

  function rechazar() {
    writeConsent("rejected");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-banner-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-black shadow-2xl sm:p-8">
        <h2 id="consent-banner-title" className="font-display text-xl font-bold tracking-tight">
          🍪 Aviso de Privacidad y Cookies
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-black/80">
          Usamos cookies necesarias para que funcione Fuera Libreta. Al
          continuar navegando aceptas nuestro{" "}
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
            Términos y Condiciones
          </Link>
          .
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={rechazar}
            className="h-11 shrink-0 rounded-md bg-gray-200 px-5 text-sm font-semibold text-black transition-colors hover:bg-gray-300"
          >
            Rechazar
          </button>
          <button
            type="button"
            onClick={aceptar}
            className="h-12 shrink-0 rounded-md bg-black px-6 text-base font-bold text-white transition-colors hover:bg-black/85"
          >
            Aceptar y continuar
          </button>
        </div>
      </div>
    </div>
  );
}
