"use client";

import { useEffect, useState } from "react";

import { hoyEnZona } from "./fecha";

/**
 * "Hoy" del negocio que SE ACTUALIZA SOLO al cruzar la medianoche.
 *
 * El bug que arregla (reportado en Fondita: "la gráfica semanal se reseteaba
 * y se iba para otro día"): `hoyEnZona()` es una función pura que se evalúa
 * durante el render y nada más. React no re-renderiza por su cuenta cuando
 * cambia el reloj, así que una pantalla que se queda abierta —la tablet del
 * mostrador, el celular del dueño en la mesa, la PWA en segundo plano— se
 * queda pegada al día en que se abrió:
 *
 *   1. Abres la app un domingo a las 11pm. `hoy` = domingo.
 *   2. Pasa la medianoche. La pantalla sigue diciendo domingo: los totales
 *      de "hoy" siguen siendo los del domingo, la gráfica semanal sigue
 *      pintando la semana que acaba de terminar, y una venta nueva del
 *      lunes se guarda con fecha de lunes pero NO aparece en ningún lado.
 *   3. Llega cualquier cosa que fuerce un re-render (un pedido por realtime,
 *      tocar un botón, el polling de citas) y `hoy` salta de golpe a lunes:
 *      los totales se van a cero y la gráfica brinca de semana. Eso es lo
 *      que se veía como "se reseteó solo".
 *
 * El paso 2 es el bug de verdad (datos mal durante horas, sin ningún aviso);
 * el 3 solo es cuándo se nota. Refrescar lo tapaba, pero un cliente con la
 * tablet prendida toda la noche no refresca — se queda con el día anterior
 * hasta que alguien la toca.
 *
 * Con esto, la medianoche del NEGOCIO (no la del dispositivo: un celular en
 * otra zona horaria tiene su propia medianoche, que no es cuando le cambia
 * el día al negocio) programa un re-render. El día cambia solo, a tiempo, y
 * sin saltos.
 */
export function useHoy(timezone?: string): string {
  const [hoy, setHoy] = useState(() => hoyEnZona(timezone));

  useEffect(() => {
    // Al montar (y al cambiar de negocio/zona) se re-sincroniza de una vez:
    // el estado inicial pudo quedarse viejo si el componente se montó con un
    // valor de otra zona, o si el dispositivo estaba dormido.
    setHoy(hoyEnZona(timezone));

    let cancelado = false;
    let timer: ReturnType<typeof setTimeout>;

    function programarSiguienteMedianoche() {
      // No se calcula "cuánto falta para las 00:00" con aritmética de zonas
      // horarias (horario de verano, offsets de :30/:45, etc. lo vuelven un
      // campo minado). En vez de eso se despierta cada minuto y se compara
      // el string del día: es exacto por construcción y el costo es nulo
      // —una comparación de strings por minuto— comparado con equivocarse
      // en el cálculo del offset justo el día que cambia el horario.
      timer = setTimeout(() => {
        if (cancelado) return;
        const ahora = hoyEnZona(timezone);
        // setHoy con el mismo string no re-renderiza (React compara por
        // Object.is), así que los 1439 minutos que no son medianoche no
        // cuestan nada.
        setHoy((prev) => (prev === ahora ? prev : ahora));
        programarSiguienteMedianoche();
      }, 60_000);
    }

    programarSiguienteMedianoche();

    // La PWA en segundo plano es el caso que más importa y el que ningún
    // temporizador cubre solo: iOS y Android congelan los setTimeout de una
    // pestaña oculta, así que la tablet que pasó la noche con la pantalla
    // apagada despierta con el día viejo. Al volver a primer plano se
    // recalcula de inmediato, sin esperar al siguiente tick.
    function alVolver() {
      if (document.visibilityState !== "visible") return;
      const ahora = hoyEnZona(timezone);
      setHoy((prev) => (prev === ahora ? prev : ahora));
    }

    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      cancelado = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [timezone]);

  return hoy;
}
