"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { readConsent, writeConsent } from "@/lib/consent";

async function insertConsentimiento(userAgent: string) {
  if (!isSupabaseConfigured) {
    return { error: new Error("Supabase no configurado (faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).") };
  }
  try {
    // supabase = createBrowserClient con la anon key (lib/supabase.ts), así
    // que este insert queda sujeto a RLS igual que cualquier visitante.
    const { error } = await supabase.from("consentimientos").insert({
      negocio_id: null,
      acepto_terminos: true,
      acepto_privacidad: true,
      acepto_cookies: true,
      user_agent: userAgent,
    });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Modal de cookies obligatorio, pero SOLO en la página principal ("/"): ahí
 * bloquea toda la pantalla (overlay + scroll del body) hasta que el usuario
 * acepta. En cualquier otra ruta —incluidas las legales /aviso-privacidad,
 * /terminos y /cookies— no se muestra, para que se puedan leer sin pedir
 * que se acepten primero. Al volver a "/" sin haber aceptado, reaparece.
 * No se cierra con click afuera, solo con el botón. Montado una sola vez
 * en app/layout.tsx.
 *
 * Este banner solo se ve en "/" antes de iniciar sesión (app/page.tsx
 * redirige del lado del servidor en cuanto hay usuario logueado), así que
 * todavía no hay negocio: el consentimiento se guarda con negocio_id null.
 * localStorage solo se escribe si el insert en Supabase tuvo éxito, para no
 * "recordar" una aceptación que nunca quedó registrada.
 */
export function ConsentBanner() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [visible, setVisible] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    setVisible(isHome && readConsent() !== "accepted");
  }, [isHome]);

  React.useEffect(() => {
    document.body.style.overflow = visible ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  async function aceptar() {
    setSubmitting(true);
    setError(false);

    const { error: insertError } = await insertConsentimiento(navigator.userAgent);

    setSubmitting(false);

    if (insertError) {
      console.error("[ConsentBanner] error al insertar en consentimientos:", insertError);
      setError(true);
      return;
    }

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
          <Link href="/aviso-privacidad" className="font-medium text-amber-700 underline underline-offset-2">
            Aviso de Privacidad
          </Link>{" "}
          y{" "}
          <Link href="/terminos" className="font-medium text-amber-700 underline underline-offset-2">
            Términos
          </Link>
          .
        </p>

        <button
          type="button"
          onClick={aceptar}
          disabled={submitting}
          className="mt-6 h-12 w-full rounded-md bg-black text-base font-bold text-white transition-colors hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Guardando..." : "Aceptar y continuar"}
        </button>
        {error ? (
          <p className="mt-3 text-xs font-medium text-red-600">
            No se pudo guardar tu consentimiento. Intenta de nuevo.
          </p>
        ) : null}
      </div>
    </div>
  );
}
