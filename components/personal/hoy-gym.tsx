"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight, Dumbbell } from "lucide-react";

import { obtenerSesiones } from "@/lib/personal/api";
import { volumenSeries } from "@/lib/personal/reglas";
import type { ISODate, Sesion } from "@/lib/personal/tipos";
import { EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";

/**
 * Resumen del entrenamiento del día. La captura de series NO vive aquí: cargar
 * la tabla de pesos y repeticiones dentro de la pantalla Hoy la volvería una
 * pantalla de gym con un día alrededor. Aquí solo se ve si ya entrenaste y
 * cuánto moviste; el detalle está a un toque, en /app/mi-dia/gym.
 */
export function BloqueGym({ fecha }: { fecha: ISODate }) {
  const [sesiones, setSesiones] = React.useState<Sesion[]>([]);
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    let vivo = true;
    setCargando(true);
    obtenerSesiones(fecha, fecha)
      .then((s) => vivo && setSesiones(s))
      .catch((err) => {
        console.error("No se pudieron leer las sesiones:", err);
        if (vivo) toast.error("No se pudo cargar el gym");
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [fecha]);

  return (
    <Tarjeta>
      <TituloTarjeta icono={<Dumbbell className="h-3.5 w-3.5" />}>Entrenamiento</TituloTarjeta>

      {cargando ? (
        <EstadoVacio className="py-2">Cargando…</EstadoVacio>
      ) : sesiones.length === 0 ? (
        <Link
          href={`/app/mi-dia/gym?fecha=${fecha}&nuevo=1`}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Dumbbell className="h-4 w-4" /> Registrar entrenamiento
        </Link>
      ) : (
        <div className="flex flex-col gap-2">
          {sesiones.map((s) => {
            const series = s.ejercicios.flatMap((e) => e.series);
            const volumen = volumenSeries(series);
            return (
              <Link
                key={s.id}
                href={`/app/mi-dia/gym?sesion=${s.id}`}
                className="flex items-center gap-3 rounded-lg bg-secondary/60 px-3 py-3 transition-colors hover:bg-secondary"
              >
                <div className="min-w-0 flex-1">
                  <p className="mid-display truncate text-[16px]">{s.nombre}</p>
                  <p className="mid-num mt-0.5 text-[12px] text-muted-foreground">
                    {s.ejercicios.length} {s.ejercicios.length === 1 ? "ejercicio" : "ejercicios"} · {series.length}{" "}
                    series
                    {volumen > 0 && <> · {Math.round(volumen).toLocaleString("es-MX")} kg movidos</>}
                    {s.duracionMin ? ` · ${s.duracionMin} min` : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
          <Link
            href={`/app/mi-dia/gym?fecha=${fecha}&nuevo=1`}
            className="text-center text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            + Otra sesión
          </Link>
        </div>
      )}
    </Tarjeta>
  );
}
