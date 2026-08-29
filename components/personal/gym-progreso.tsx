"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Medal, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { ejerciciosConocidos, marcasPorEjercicio, normalizarEjercicio, progresionDe } from "@/lib/personal/gym";
import type { Sesion } from "@/lib/personal/tipos";
import { useColoresGrafica } from "./grafica";
import { EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";

/**
 * Progresión de un ejercicio en el tiempo.
 *
 * Se grafican DOS series y no una:
 *  - Peso máximo: el número que uno presume.
 *  - 1RM estimado (Epley): el que de verdad dice si estás progresando, porque
 *    compara 60kg×5 contra 50kg×10. Sin él, bajar de reps se ve como una
 *    subida y subir de reps se ve como un estancamiento.
 */
export function PanelProgreso({ sesiones }: { sesiones: Sesion[] }) {
  const colores = useColoresGrafica();
  const nombres = React.useMemo(() => ejerciciosConocidos(sesiones), [sesiones]);
  const [elegido, setElegido] = React.useState<string | null>(null);

  // El más entrenado como default; si cambia el historial y el elegido
  // desaparece, se cae al primero disponible.
  const activo = elegido && nombres.some((n) => normalizarEjercicio(n) === normalizarEjercicio(elegido))
    ? elegido
    : nombres[0] ?? null;

  const puntos = React.useMemo(() => (activo ? progresionDe(sesiones, activo) : []), [sesiones, activo]);
  const marca = React.useMemo(
    () => (activo ? marcasPorEjercicio(sesiones).get(normalizarEjercicio(activo)) ?? null : null),
    [sesiones, activo]
  );

  if (nombres.length === 0) {
    return (
      <Tarjeta>
        <EstadoVacio>
          Todavía no hay ejercicios registrados. En cuanto guardes una sesión con peso y repeticiones, aquí aparece
          la curva.
        </EstadoVacio>
      </Tarjeta>
    );
  }

  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const delta = primero && ultimo ? ultimo.unoRM - primero.unoRM : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="mid-sin-barra -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {nombres.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setElegido(n)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
              activo === n
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {n}
          </button>
        ))}
      </div>

      {marca && (
        <Tarjeta>
          <TituloTarjeta icono={<Medal className="h-3.5 w-3.5" />}>Tu marca en {marca.nombre}</TituloTarjeta>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="mid-etiqueta">Mejor serie</p>
              <p className="mid-num mid-display mt-0.5 text-[19px]">
                {marca.mejorSerie ? `${marca.mejorSerie.pesoKg}×${marca.mejorSerie.repeticiones}` : "—"}
              </p>
            </div>
            <div>
              <p className="mid-etiqueta">Peso máximo</p>
              <p className="mid-num mid-display mt-0.5 text-[19px]">
                {marca.pesoMaximo > 0 ? `${marca.pesoMaximo} kg` : "—"}
              </p>
            </div>
            <div>
              <p className="mid-etiqueta">Sesiones</p>
              <p className="mid-num mid-display mt-0.5 text-[19px]">{marca.vecesEntrenado}</p>
            </div>
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        <TituloTarjeta
          icono={<TrendingUp className="h-3.5 w-3.5" />}
          accion={
            puntos.length > 1 && (
              <span
                className={cn(
                  "mid-num text-[12px] font-semibold",
                  delta > 0 ? "text-[hsl(var(--mid-cumplido))]" : delta < 0 ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {delta > 0 ? "+" : ""}
                {Math.round(delta * 10) / 10} kg de 1RM
              </span>
            )
          }
        >
          Progresión
        </TituloTarjeta>

        {puntos.length < 2 ? (
          <EstadoVacio>
            Con una sola sesión no hay curva todavía. Registra este ejercicio otro día y aquí se ve la línea.
          </EstadoVacio>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={puntos} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={colores.reja} />
                <XAxis
                  dataKey="etiqueta"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colores.eje, fontSize: 11 }}
                  interval={puntos.length > 12 ? Math.ceil(puntos.length / 8) : 0}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colores.eje, fontSize: 11 }}
                  width={44}
                  domain={["dataMin - 5", "dataMax + 5"]}
                />
                <Tooltip
                  contentStyle={colores.tooltip}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  formatter={(valor, nombre) => [`${valor ?? 0} kg`, String(nombre ?? "")]}
                />
                <Line
                  type="monotone"
                  dataKey="unoRM"
                  name="1RM estimado"
                  stroke={colores.primario}
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: colores.primario }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="pesoMaximo"
                  name="Peso máximo"
                  stroke={colores.azul}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: colores.primario }} /> 1RM estimado
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: colores.azul }} /> Peso máximo
              </span>
            </div>
          </>
        )}
      </Tarjeta>
    </div>
  );
}
