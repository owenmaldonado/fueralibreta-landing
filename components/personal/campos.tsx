"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

// ============================================================================
// Campos de captura. Todos son "sin caja": se ven como renglones de un
// cuaderno, no como un formulario. La caja aparece al enfocar.
//
// Ninguno guarda por su cuenta — el debounce vive en useDia (lib/personal/
// use-dia.ts), un solo lugar para toda la pantalla.
// ============================================================================

/** Textarea que crece con el texto: nunca hay scroll interno ni una caja vacía de 5 renglones. */
export function AreaTexto({
  valor,
  onChange,
  placeholder,
  className,
  filasMinimas = 1,
  serif = false,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  filasMinimas?: number;
  serif?: boolean;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const ajustarAlto = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Se reajusta también cuando el valor cambia desde fuera (al cargar el día).
  React.useEffect(ajustarAlto, [valor, ajustarAlto]);

  return (
    <textarea
      ref={ref}
      rows={filasMinimas}
      value={valor}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        ajustarAlto();
      }}
      className={cn(
        "w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60",
        serif && "mid-display text-[17px] font-normal",
        className
      )}
    />
  );
}

export function CampoLinea({
  valor,
  onChange,
  placeholder,
  tipo = "text",
  className,
  ...props
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tipo?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "className">) {
  return (
    <input
      type={tipo}
      value={valor}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/60",
        className
      )}
      {...props}
    />
  );
}

/** Campo con caja, para diálogos y formularios de verdad. */
export function CampoCaja({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-surface px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/70 focus:ring-1 focus:ring-primary/40",
        className
      )}
      {...props}
    />
  );
}

export function AreaCaja({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-lg border border-input bg-surface px-3 py-2.5 text-[15px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/70 focus:ring-1 focus:ring-primary/40",
        className
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Agua
// ---------------------------------------------------------------------------

const META_VASOS = 8;

/**
 * Vasos de agua: un toque en el siguiente vaso lo llena; un toque en uno ya
 * lleno regresa a ese número (así se corrige de más sin un botón de "menos").
 * Pasado el 8º, se sigue sumando con el +.
 */
export function ContadorAgua({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Array.from({ length: META_VASOS }, (_, i) => i + 1).map((n) => {
        const lleno = valor >= n;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} ${n === 1 ? "vaso" : "vasos"} de agua`}
            aria-pressed={lleno}
            onClick={() => onChange(valor === n ? n - 1 : n)}
            className={cn(
              "h-8 w-6 rounded-b-[7px] rounded-t-[3px] border transition-all active:scale-90",
              lleno
                ? "mid-pop border-sky-400/60 bg-sky-400/70"
                : "border-border bg-transparent hover:border-sky-400/40"
            )}
          />
        );
      })}
      {valor > META_VASOS && (
        <span className="mid-num ml-1 text-sm font-semibold text-sky-400">+{valor - META_VASOS}</span>
      )}
      <button
        type="button"
        aria-label="Un vaso más"
        onClick={() => onChange(valor + 1)}
        className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper numérico (horas de sueño, peso, duración)
// ---------------------------------------------------------------------------

export function Stepper({
  valor,
  onChange,
  paso = 0.5,
  min = 0,
  max = 24,
  sufijo,
  decimales = 1,
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
  paso?: number;
  min?: number;
  max?: number;
  sufijo?: string;
  decimales?: number;
}) {
  const mostrado = valor == null ? "—" : `${Number(valor.toFixed(decimales))}${sufijo ?? ""}`;

  function mover(delta: number) {
    const base = valor ?? (delta > 0 ? min : min + paso);
    const siguiente = Math.min(max, Math.max(min, Number((base + delta).toFixed(2))));
    onChange(siguiente);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Restar"
        onClick={() => mover(-paso)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground active:scale-90"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        // Un toque largo/click en el número lo borra: sin esto, un dato puesto
        // por error se queda para siempre porque no hay forma de volver a "sin dato".
        onClick={() => onChange(null)}
        title="Toca el número para dejarlo en blanco"
        className="mid-num mid-display min-w-[4.5rem] text-center text-2xl font-semibold tabular-nums"
      >
        {mostrado}
      </button>
      <button
        type="button"
        aria-label="Sumar"
        onClick={() => mover(paso)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground active:scale-90"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
