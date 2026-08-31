"use client";

import { useEffect } from "react";

/**
 * Registra el service worker de la PWA y decide CUÁNDO es seguro recargar
 * la pestaña para estrenar una versión nueva.
 *
 * EL BUG QUE CIERRA (Owen: "de la nada se refresca cada 20 segundos, me pasé
 * poniendo el PIN de dueño y creando otro y pues se borraba; imagínate que se
 * borre media venta porque se reinició la página sola")
 *
 * Este archivo tenía UNA sola condición para recargar: que llegara el evento
 * `controllerchange`. Y ese evento NO significa solo "hay una versión nueva".
 * También se dispara la PRIMERA vez que un service worker toma control de una
 * pestaña que se cargó sin ninguno — que es exactamente lo que pasa en la
 * carga inicial, porque public/sw.js hace skipWaiting() + clients.claim().
 * Resultado: entrar a la app y, unos segundos después, una recarga completa
 * sin ningún motivo, borrando lo que estuviera escrito en pantalla.
 *
 * Peor todavía: esa recarga volvía a dejar la pestaña sin controlador en
 * algunos navegadores (o con un registro a medio activar), y el ciclo se
 * repetía. De ahí la sensación de "se refresca solo cada tanto".
 *
 * TRES CANDADOS
 * 1. Solo se recarga si YA había un controlador al montar. Sin controlador
 *    previo no hay "versión vieja" que reemplazar: la página que se está
 *    viendo ya es la nueva, no hay nada que estrenar.
 * 2. Nunca se recarga encima de trabajo a medias. Si hay texto escrito en un
 *    input, un modal abierto o algo pendiente de subir, la recarga se aplaza
 *    hasta que la pestaña quede sin nada que perder. La versión nueva puede
 *    esperar; un pedido a medio cobrar, no.
 * 3. Una sola recarga por pestaña, pase lo que pase. Aunque algo se
 *    desalinee, nunca puede convertirse en un bucle de recargas.
 *
 * En desarrollo el SW solo estorba: cachea el bundle de una sesión de `next
 * dev` anterior y esconde bugs reales detrás de una versión vieja. Ahí se
 * desregistra cualquier SW existente y se borra su Cache Storage en cada
 * carga, y nunca se registra uno nuevo.
 */

/** Una sola recarga por pestaña — sobrevive a la propia recarga. */
const YA_RECARGO_KEY = "fl_sw_recargo";

/**
 * ¿Hay algo en pantalla que una recarga se llevaría?
 *
 * Es a propósito conservador: ante la duda, NO se recarga. Perder una
 * actualización un rato no le cuesta nada a nadie; perder una venta a medio
 * capturar sí.
 */
function hayTrabajoEnCurso(): boolean {
  if (typeof document === "undefined") return true;

  // Un diálogo/bottom-sheet abierto = alguien está a media tarea.
  if (document.querySelector("[role='dialog'], dialog[open]")) return true;

  // Cualquier campo con algo escrito (el PIN a medio teclear, el monto de un
  // gasto, el nombre de un empleado nuevo).
  const campos = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  for (const campo of Array.from(campos)) {
    if (campo.type === "hidden" || campo.disabled) continue;
    if (campo.value.trim() !== "") return true;
  }

  // El foco dentro de un campo, aunque esté vacío: alguien está por escribir.
  const activo = document.activeElement;
  if (activo instanceof HTMLElement && activo.matches("input, textarea, select, [contenteditable='true']")) return true;

  return false;
}

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

    // Candado 1: se lee AHORA, al montar, antes de registrar nada. Si esta
    // pestaña no tenía controlador, el `controllerchange` que llegue después
    // es el del primer claim, no el de una versión nueva.
    const habiaControlador = Boolean(navigator.serviceWorker.controller);

    let pendiente = false;
    let cancelado = false;

    function yaRecargoEstaPestana(): boolean {
      try {
        return window.sessionStorage.getItem(YA_RECARGO_KEY) === "1";
      } catch {
        // sessionStorage bloqueado (modo privado estricto): sin candado
        // persistente, pero `pendiente` sigue evitando recargas repetidas
        // mientras la pestaña siga viva.
        return false;
      }
    }

    function recargarSiSePuede() {
      if (cancelado || !pendiente) return;
      if (yaRecargoEstaPestana()) return; // candado 3
      if (hayTrabajoEnCurso()) return; // candado 2: se reintenta en el próximo evento
      pendiente = false;
      try {
        window.sessionStorage.setItem(YA_RECARGO_KEY, "1");
      } catch {
        // ver yaRecargoEstaPestana
      }
      window.location.reload();
    }

    function onControllerChange() {
      if (!habiaControlador) {
        // Primer claim de la vida de esta pestaña: la página ya es la versión
        // nueva, no hay nada que estrenar. Este era el bug.
        console.log("[pwa] el service worker tomó control por primera vez — no hace falta recargar");
        return;
      }
      pendiente = true;
      recargarSiSePuede();
    }

    // Si la recarga se aplazó por trabajo en curso, se reintenta en los
    // momentos donde es más probable que la pantalla ya esté libre: al
    // cambiar de pestaña, al volver, o cuando alguien suelta el teclado.
    function reintentar() {
      recargarSiSePuede();
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", reintentar);
    window.addEventListener("focus", reintentar);

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[pwa] no se pudo registrar el service worker:", err);
    });

    return () => {
      cancelado = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", reintentar);
      window.removeEventListener("focus", reintentar);
    };
  }, []);

  return null;
}
