"use client";

import { useEffect } from "react";

/**
 * autoUpdate: el SW (skipWaiting + clientsClaim, ver public/sw.js) toma
 * control apenas se instala una versión nueva, sin esperar a que el usuario
 * cierre todas las pestañas — este listener es la otra mitad: recarga la
 * pestaña UNA vez cuando eso pasa, para que el usuario vea la versión nueva
 * en vez de quedarse en una pantalla vieja controlada por el SW anterior.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refrescando = false;
    function onControllerChange() {
      if (refrescando) return;
      refrescando = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[pwa] no se pudo registrar el service worker:", err);
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
