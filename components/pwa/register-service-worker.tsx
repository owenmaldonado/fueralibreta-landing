"use client";

import { useEffect } from "react";

/**
 * autoUpdate: el SW (skipWaiting + clientsClaim, ver public/sw.js) toma
 * control apenas se instala una versión nueva, sin esperar a que el usuario
 * cierre todas las pestañas — este listener es la otra mitad: recarga la
 * pestaña UNA vez cuando eso pasa, para que el usuario vea la versión nueva
 * en vez de quedarse en una pantalla vieja controlada por el SW anterior.
 *
 * En desarrollo el SW solo estorba: cachea el bundle de una sesión de `next
 * dev` anterior y esconde bugs reales de código nuevo detrás de una versión
 * vieja. Ahí se desregistra cualquier SW existente y se borra su Cache
 * Storage en cada carga, y nunca se registra uno nuevo.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
      return;
    }

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
