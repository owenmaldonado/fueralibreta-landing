import * as React from "react";

export type ConsentValue = "accepted" | "rejected" | null;

const KEY = "fl-consent";
const EVENT = "fl_consent_change";

/**
 * Lee la decisión de cookies guardada en localStorage. `null` significa
 * "todavía no decide" (nunca aceptó ni rechazó), distinto de "rejected".
 */
export function readConsent(): ConsentValue {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === "accepted" || raw === "rejected" ? raw : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: "accepted" | "rejected"): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      // localStorage no disponible (modo privado, etc.): igual notificamos a la UI actual.
    }
    window.dispatchEvent(new Event(EVENT));
  }
}

/**
 * Se re-evalúa cuando <ConsentBanner /> guarda una decisión (mismo tab) o
 * cuando cambia en otra pestaña (evento "storage"). Lo usan los componentes
 * que deben ocultarse si el usuario rechazó las cookies (p. ej. gráficas).
 */
export function useConsent(): ConsentValue {
  const [consent, setConsent] = React.useState<ConsentValue>(null);

  React.useEffect(() => {
    setConsent(readConsent());
    function onChange() {
      setConsent(readConsent());
    }
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return consent;
}
