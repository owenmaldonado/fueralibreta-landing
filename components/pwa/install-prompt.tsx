"use client";

import * as React from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS/Safari no expone display-mode ni beforeinstallprompt: usa su propia bandera.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Botón "Instalar app" del TopBar. Chrome/Edge en Android disparan
 * beforeinstallprompt solo cuando la app cumple los criterios de
 * instalabilidad (manifest + SW registrado) y todavía no está instalada —
 * ese evento es la única señal de "se puede instalar", así que el botón
 * permanece oculto hasta que llega. iOS nunca lo dispara: ahí no hay botón,
 * se instala desde Compartir > Agregar a inicio.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);

  React.useEffect(() => {
    setInstalled(isStandalone());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // El evento solo se puede usar una vez, se haya aceptado o no.
    setDeferredPrompt(null);
  }

  if (installed || !deferredPrompt) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-primary transition-colors hover:bg-primary/25"
    >
      <Download className="h-3.5 w-3.5" /> Instalar app
    </button>
  );
}
