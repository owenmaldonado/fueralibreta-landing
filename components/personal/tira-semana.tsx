"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { DIAS_CORTOS, aDate, hoy, semanaDe, sumarDias, type ISODate } from "@/lib/personal/fechas";

/**
 * La semana en una tira. Es la navegación principal de "Hoy": moverse a ayer
 * o al lunes pasado es un toque, no entrar a un calendario y regresar.
 *
 * Cada día trae su anillo de cumplimiento, así que la tira no solo navega:
 * de un vistazo se ve cómo viene la semana.
 */
export function TiraSemana({
  fecha,
  onSeleccionar,
  progresoPorDia,
}: {
  fecha: ISODate;
  onSeleccionar: (f: ISODate) => void;
  /** fecha -> 0-100 de hábitos cumplidos ese día. */
  progresoPorDia: Map<ISODate, number>;
}) {
  const dias = React.useMemo(() => semanaDe(fecha), [fecha]);
  const hoyISO = hoy();

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Semana anterior"
        onClick={() => onSeleccionar(sumarDias(fecha, -7))}
        className="flex h-9 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex flex-1 justify-between gap-0.5">
        {dias.map((d) => {
          const seleccionado = d === fecha;
          const esHoy = d === hoyISO;
          const futuro = d > hoyISO;
          const pct = progresoPorDia.get(d) ?? 0;
          const numero = aDate(d).getDate();

          return (
            <button
              key={d}
              type="button"
              onClick={() => onSeleccionar(d)}
              aria-current={seleccionado ? "date" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition-colors",
                seleccionado ? "bg-secondary" : "hover:bg-secondary/50",
                futuro && !seleccionado && "opacity-45"
              )}
            >
              <span className="mid-etiqueta text-[9px] leading-none">{DIAS_CORTOS[aDate(d).getDay()]}</span>
              <span
                className={cn(
                  "mid-num relative flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold",
                  esHoy && !seleccionado && "ring-1 ring-primary/60",
                  seleccionado && "bg-primary text-primary-foreground"
                )}
              >
                {/* Arco de cumplimiento alrededor del número. conic-gradient en
                    vez de un SVG por día: son 7 anillos por semana y esto es un
                    solo background, sin 7 sub-árboles de DOM. */}
                {!seleccionado && pct > 0 && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(hsl(var(--mid-cumplido)) ${pct * 3.6}deg, transparent 0)`,
                      mask: "radial-gradient(circle, transparent 62%, #000 64%)",
                      WebkitMask: "radial-gradient(circle, transparent 62%, #000 64%)",
                    }}
                  />
                )}
                {numero}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Semana siguiente"
        onClick={() => onSeleccionar(sumarDias(fecha, 7))}
        className="flex h-9 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
