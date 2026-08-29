"use client";

import * as React from "react";
import { Check, Cloud, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EstadoHabito } from "@/lib/personal/tipos";

// ============================================================================
// Piezas chicas compartidas por todas las pantallas de Mi Día.
// ============================================================================

export function Tarjeta({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn("mid-tarjeta p-4", className)} {...props}>
      {children}
    </section>
  );
}

export function TituloTarjeta({
  children,
  accion,
  icono,
}: {
  children: React.ReactNode;
  accion?: React.ReactNode;
  icono?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="mid-etiqueta flex items-center gap-1.5">
        {icono}
        {children}
      </h2>
      {accion}
    </div>
  );
}

export function EstadoVacio({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("py-4 text-center text-sm text-muted-foreground", className)}>{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Guardado
// ---------------------------------------------------------------------------

export type EstadoGuardado = "inactivo" | "guardando" | "guardado" | "error";

/**
 * El "todo va bien" del autoguardado. Nunca dice "Guardado" de más: se queda
 * mudo hasta que hay algo que reportar, y el check se desvanece solo.
 */
export function IndicadorGuardado({ estado }: { estado: EstadoGuardado }) {
  if (estado === "inactivo") return null;
  if (estado === "guardando") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Guardando
      </span>
    );
  }
  if (estado === "error") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
        <TriangleAlert className="h-3 w-3" /> No se guardó
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Check className="h-3 w-3 text-[hsl(var(--mid-cumplido))]" /> Guardado
    </span>
  );
}

// ---------------------------------------------------------------------------
// Anillo de progreso
// ---------------------------------------------------------------------------

/**
 * Anillo del progreso del día. SVG puro (sin recharts): es un solo arco, y
 * cargar una librería de gráficas para dibujar un círculo sería pagar 90 kB
 * por una línea de trigonometría.
 */
export function AnilloProgreso({
  porcentaje,
  tamano = 84,
  grosor = 7,
  children,
  color = "hsl(var(--primary))",
}: {
  porcentaje: number;
  tamano?: number;
  grosor?: number;
  children?: React.ReactNode;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, porcentaje));
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const avance = (pct / 100) * circunferencia;

  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90" aria-hidden>
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          fill="none"
          stroke="hsl(var(--mid-pendiente))"
          strokeWidth={grosor}
        />
        <circle
          className="mid-trazo"
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={`${avance} ${circunferencia}`}
          style={{ ["--mid-trazo-inicio" as string]: `${circunferencia}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colores de estado de hábito — un solo lugar, usado por Hoy, el tracker
// mensual y el calendario anual, para que los tres siempre digan lo mismo.
// ---------------------------------------------------------------------------

export const COLOR_ESTADO: Record<EstadoHabito, string> = {
  cumplido: "hsl(var(--mid-cumplido))",
  justificado: "hsl(var(--mid-justificado))",
  fallado: "hsl(var(--mid-fallado))",
  pendiente: "hsl(var(--mid-pendiente))",
  "no-aplica": "transparent",
};

export const ETIQUETA_ESTADO: Record<EstadoHabito, string> = {
  cumplido: "Cumplido",
  justificado: "No cumplido, con motivo",
  fallado: "No cumplido",
  pendiente: "Sin marcar",
  "no-aplica": "No tocaba",
};

// ---------------------------------------------------------------------------
// Clima
// ---------------------------------------------------------------------------

export const CLIMAS = [
  { clave: "soleado", emoji: "☀️", etiqueta: "Soleado" },
  { clave: "nublado", emoji: "☁️", etiqueta: "Nublado" },
  { clave: "lluvia", emoji: "🌧️", etiqueta: "Lluvia" },
  { clave: "calor", emoji: "🔥", etiqueta: "Calor" },
  { clave: "frio", emoji: "❄️", etiqueta: "Frío" },
] as const;

export function SelectorClima({
  valor,
  onChange,
}: {
  valor: string | null;
  onChange: (clima: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {CLIMAS.map((c) => (
        <button
          key={c.clave}
          type="button"
          title={c.etiqueta}
          aria-label={c.etiqueta}
          aria-pressed={valor === c.clave}
          onClick={() => onChange(valor === c.clave ? null : c.clave)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-base transition-all",
            valor === c.clave
              ? "bg-secondary ring-1 ring-primary/60"
              : "opacity-45 hover:opacity-100"
          )}
        >
          {c.emoji}
        </button>
      ))}
      {valor === null && <Cloud className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" aria-hidden />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Escalas 1-5
// ---------------------------------------------------------------------------

const CARAS_ANIMO = [
  { valor: 1, emoji: "😞", etiqueta: "Muy mal" },
  { valor: 2, emoji: "🙁", etiqueta: "Mal" },
  { valor: 3, emoji: "😐", etiqueta: "Normal" },
  { valor: 4, emoji: "🙂", etiqueta: "Bien" },
  { valor: 5, emoji: "😄", etiqueta: "Excelente" },
];

export const ETIQUETA_ANIMO = new Map(CARAS_ANIMO.map((c) => [c.valor, c.etiqueta]));
export const EMOJI_ANIMO = new Map(CARAS_ANIMO.map((c) => [c.valor, c.emoji]));

export function EscalaAnimo({
  valor,
  onChange,
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      {CARAS_ANIMO.map((c) => {
        const activo = valor === c.valor;
        return (
          <button
            key={c.valor}
            type="button"
            aria-label={c.etiqueta}
            aria-pressed={activo}
            onClick={() => onChange(activo ? null : c.valor)}
            className={cn(
              "flex h-12 flex-1 items-center justify-center rounded-lg text-2xl transition-all",
              activo
                ? "mid-pop bg-primary/15 ring-1 ring-primary"
                : "opacity-40 hover:opacity-90 active:scale-95"
            )}
          >
            {c.emoji}
          </button>
        );
      })}
    </div>
  );
}

/** Barras de 1 a 5 — para energía, que no pide una cara sino una intensidad. */
export function EscalaBarras({
  valor,
  onChange,
  color = "hsl(var(--primary))",
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
  color?: string;
}) {
  return (
    <div className="flex items-end gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const encendida = (valor ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            aria-label={`Nivel ${n} de 5`}
            aria-pressed={encendida}
            onClick={() => onChange(valor === n ? null : n)}
            className="group flex-1 rounded-md pt-2 transition-transform active:scale-95"
          >
            <span
              className="block w-full rounded-[3px] transition-all"
              style={{
                height: 8 + n * 5,
                background: encendida ? color : "hsl(var(--mid-pendiente))",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
