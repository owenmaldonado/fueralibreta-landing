"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Flame, Settings2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { limpiarRegistro, marcarHabito } from "@/lib/personal/api";
import { aplicaEn, estadoDe, puntosDe } from "@/lib/personal/reglas";
import type { EstadoHabito, Habito, ISODate, RegistroHabito } from "@/lib/personal/tipos";
import { EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";

/**
 * Los hábitos del día. Toda la interacción cabe en un toque:
 *
 *   ✓  → cumplido (verde). Otro toque lo regresa a sin marcar.
 *   ✕  → no cumplido. Se guarda YA en rojo y aparece el campo "¿por qué?".
 *        En cuanto escribes algo, el mismo registro pasa a naranja
 *        (justificado): cero puntos, pero la racha no se rompe.
 *
 * El campo del motivo aparece DESPUÉS de guardar, no antes, a propósito: si
 * marcar un hábito como fallado abriera un diálogo obligatorio, dejarías de
 * marcarlos los días malos — justo los días que más importa registrar.
 */

const RETARDO_MOTIVO_MS = 800;

export function BloqueHabitos({
  fecha,
  habitos,
  registros,
  rachas,
  onCambio,
}: {
  fecha: ISODate;
  habitos: Habito[];
  /** habitoId -> registro de ESTA fecha */
  registros: Map<string, RegistroHabito>;
  /** habitoId -> racha actual */
  rachas: Map<string, number>;
  onCambio: (registro: RegistroHabito | null, habitoId: string) => void;
}) {
  const delDia = habitos.filter((h) => aplicaEn(h, fecha));
  const descansando = habitos.length - delDia.length;

  return (
    <Tarjeta>
      <TituloTarjeta
        accion={
          <Link
            href="/app/mi-dia/habitos"
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" /> Gestionar
          </Link>
        }
      >
        Hábitos de hoy
      </TituloTarjeta>

      {delDia.length === 0 ? (
        <EstadoVacio>
          {habitos.length === 0 ? (
            <>
              Todavía no tienes hábitos.{" "}
              <Link href="/app/mi-dia/habitos" className="font-medium text-primary underline underline-offset-4">
                Crea el primero
              </Link>
              .
            </>
          ) : (
            "Hoy no toca ninguno. Día de descanso."
          )}
        </EstadoVacio>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {delDia.map((habito) => (
            <FilaHabito
              key={habito.id}
              habito={habito}
              fecha={fecha}
              registro={registros.get(habito.id)}
              racha={rachas.get(habito.id) ?? 0}
              onCambio={onCambio}
            />
          ))}
        </div>
      )}

      {descansando > 0 && delDia.length > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {descansando} {descansando === 1 ? "hábito no toca" : "hábitos no tocan"} hoy.
        </p>
      )}
    </Tarjeta>
  );
}

function FilaHabito({
  habito,
  fecha,
  registro,
  racha,
  onCambio,
}: {
  habito: Habito;
  fecha: ISODate;
  registro: RegistroHabito | undefined;
  racha: number;
  onCambio: (registro: RegistroHabito | null, habitoId: string) => void;
}) {
  const estado = estadoDe(habito, fecha, registro);
  const [motivo, setMotivo] = React.useState(registro?.motivo ?? "");
  const [guardando, setGuardando] = React.useState(false);
  const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el registro cambia desde fuera (cambio de día, recarga), el campo del
  // motivo tiene que seguirlo: si no, se queda mostrando el motivo de ayer.
  React.useEffect(() => {
    setMotivo(registro?.motivo ?? "");
  }, [registro?.id, registro?.motivo]);

  React.useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  async function aplicar(cumplido: boolean, motivoNuevo?: string | null) {
    setGuardando(true);
    try {
      const nuevo = await marcarHabito(habito, fecha, cumplido, motivoNuevo);
      onCambio(nuevo, habito.id);
      if (cumplido && typeof navigator !== "undefined" && "vibrate" in navigator) {
        // Confirmación háptica del check. Falla en silencio donde no exista.
        try { navigator.vibrate(12); } catch { /* iOS Safari no la expone */ }
      }
    } catch (err) {
      console.error("No se pudo marcar el hábito:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function limpiar() {
    setGuardando(true);
    try {
      await limpiarRegistro(habito.id, fecha);
      setMotivo("");
      onCambio(null, habito.id);
    } catch (err) {
      console.error("No se pudo deshacer el hábito:", err);
      toast.error("No se pudo deshacer");
    } finally {
      setGuardando(false);
    }
  }

  function escribirMotivo(texto: string) {
    setMotivo(texto);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      void aplicar(false, texto);
    }, RETARDO_MOTIVO_MS);
  }

  const noCumplido = estado === "fallado" || estado === "justificado";

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-9 w-1 shrink-0 rounded-full transition-colors"
          style={{ background: BARRA_ESTADO[estado] }}
        />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
            {habito.emoji && <span className="text-base leading-none">{habito.emoji}</span>}
            {habito.nombre}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {racha > 0 && (
              <span className="flex items-center gap-0.5 font-medium text-[hsl(var(--mid-justificado))]">
                <Flame className="h-3 w-3" /> {racha}
              </span>
            )}
            <span className="mid-num">+{puntosDe(habito.dificultad)} pts</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <BotonEstado
            activo={estado === "cumplido"}
            color="hsl(var(--mid-cumplido))"
            etiqueta={`Marcar ${habito.nombre} como cumplido`}
            disabled={guardando}
            onClick={() => (estado === "cumplido" ? limpiar() : aplicar(true))}
          >
            <Check className="h-[18px] w-[18px]" strokeWidth={3} />
          </BotonEstado>
          <BotonEstado
            activo={noCumplido}
            color={estado === "justificado" ? "hsl(var(--mid-justificado))" : "hsl(var(--mid-fallado))"}
            etiqueta={`Marcar ${habito.nombre} como no cumplido`}
            disabled={guardando}
            onClick={() => (noCumplido ? limpiar() : aplicar(false, null))}
          >
            <X className="h-[18px] w-[18px]" strokeWidth={3} />
          </BotonEstado>
        </div>
      </div>

      {noCumplido && (
        <div className="mid-entrada mt-2 pl-4">
          <input
            value={motivo}
            onChange={(e) => escribirMotivo(e.target.value)}
            placeholder="¿Por qué? (opcional — con motivo no rompe la racha)"
            className="w-full rounded-lg border border-dashed border-border bg-transparent px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[hsl(var(--mid-justificado))]"
          />
        </div>
      )}
    </div>
  );
}

const BARRA_ESTADO: Record<EstadoHabito, string> = {
  cumplido: "hsl(var(--mid-cumplido))",
  justificado: "hsl(var(--mid-justificado))",
  fallado: "hsl(var(--mid-fallado))",
  pendiente: "hsl(var(--mid-pendiente))",
  "no-aplica": "transparent",
};

function BotonEstado({
  activo,
  color,
  etiqueta,
  children,
  disabled,
  onClick,
}: {
  activo: boolean;
  color: string;
  etiqueta: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      aria-pressed={activo}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full border transition-all active:scale-90 disabled:opacity-50",
        activo ? "mid-pop border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground"
      )}
      style={activo ? { background: color } : undefined}
    >
      {children}
    </button>
  );
}
