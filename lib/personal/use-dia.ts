"use client";

import * as React from "react";
import { toast } from "sonner";

import { guardarDia, obtenerDia } from "./api";
import type { Dia, DiaEditable, ISODate } from "./tipos";

export type EstadoGuardado = "inactivo" | "guardando" | "guardado" | "error";

/** Un día que todavía no existe en la base: la pantalla se pinta igual y la fila nace al primer toque. */
export function diaVacio(fecha: ISODate): Dia {
  return {
    id: "",
    fecha,
    clima: null,
    animo: null,
    energia: null,
    horasSueno: null,
    vasosAgua: 0,
    pesoKg: null,
    desayuno: null,
    comida: null,
    cena: null,
    snacks: null,
    focoDelDia: null,
    gratitud: null,
    notaDestacada: null,
    cerrado: false,
  };
}

const RETARDO_MS = 700;

/**
 * El día abierto en pantalla, con autoguardado.
 *
 * Cómo se comporta y por qué:
 *  - OPTIMISTA: el valor se ve en pantalla al instante; la red va después. Un
 *    check de hábito o un vaso de agua que tarda 300ms en "sentirse" es un
 *    check que dejas de dar.
 *  - AGRUPADO: los cambios se juntan en un solo UPDATE con RETARDO_MS de
 *    calma. Escribir un párrafo de gratitud manda una escritura, no cuarenta.
 *  - INMEDIATO para controles discretos (ánimo, agua, cerrar el día): ahí no
 *    hay nada que agrupar y esperar 700ms solo alarga la ventana en la que
 *    puedes cerrar la pestaña y perder el dato.
 *  - Al desmontar se hace flush de lo pendiente: cambiar de día o salir de la
 *    pantalla nunca se lleva lo último que escribiste.
 */
export function useDia(fecha: ISODate) {
  const [dia, setDia] = React.useState<Dia>(() => diaVacio(fecha));
  const [cargando, setCargando] = React.useState(true);
  const [estado, setEstado] = React.useState<EstadoGuardado>("inactivo");

  const pendientes = React.useRef<DiaEditable>({});
  const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fechaRef = React.useRef(fecha);
  fechaRef.current = fecha;

  const enviar = React.useCallback(async () => {
    const cambios = pendientes.current;
    pendientes.current = {};
    if (Object.keys(cambios).length === 0) return;
    const paraEstaFecha = fechaRef.current;
    setEstado("guardando");
    try {
      const guardado = await guardarDia(paraEstaFecha, cambios);
      // Si mientras tanto ya cambiaste de día, no pises el estado del día nuevo
      // con la respuesta del anterior.
      setDia((actual) => (actual.fecha === guardado.fecha ? { ...actual, id: guardado.id } : actual));
      setEstado("guardado");
    } catch (err) {
      console.error("No se pudo guardar el día:", err);
      setEstado("error");
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el día");
    }
  }, []);

  const actualizar = React.useCallback(
    (cambios: DiaEditable, inmediato = false) => {
      setDia((actual) => ({ ...actual, ...cambios }));
      pendientes.current = { ...pendientes.current, ...cambios };
      if (temporizador.current) clearTimeout(temporizador.current);
      if (inmediato) {
        void enviar();
      } else {
        temporizador.current = setTimeout(() => void enviar(), RETARDO_MS);
      }
    },
    [enviar]
  );

  // Carga del día. `vivo` evita que una respuesta lenta de una fecha vieja
  // sobreescriba la pantalla cuando ya te moviste a otro día.
  React.useEffect(() => {
    let vivo = true;
    setCargando(true);
    setEstado("inactivo");
    obtenerDia(fecha)
      .then((d) => {
        if (!vivo) return;
        setDia(d ?? diaVacio(fecha));
      })
      .catch((err) => {
        console.error("No se pudo leer el día:", err);
        if (vivo) toast.error("No se pudo cargar el día");
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [fecha]);

  // Flush al desmontar y al cerrar la pestaña.
  React.useEffect(() => {
    const alSalir = () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      void enviar();
    };
    window.addEventListener("pagehide", alSalir);
    return () => {
      window.removeEventListener("pagehide", alSalir);
      alSalir();
    };
  }, [enviar]);

  return { dia, cargando, estado, actualizar, setDia };
}
