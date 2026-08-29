"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Flame, Minus, Plus, Settings2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { limpiarRegistro, marcarHabito } from "@/lib/personal/api";
import { aplicaEn, estadoDe, puntosDe } from "@/lib/personal/reglas";
import type { EstadoHabito, Habito, ISODate, RegistroHabito } from "@/lib/personal/tipos";
import { COLOR_NATURAL, Medidor } from "./medidores";
import { EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";

/**
 * Los hábitos del día, como tablero de medidores.
 *
 * Antes era una lista de renglones con ✓ y ✕. Se cambió a tarjetas con un
 * medidor propio por hábito porque un renglón te obliga a LEER para saber cómo
 * vas; un tablero se ve. Los vasos medio llenos, la luna a la mitad y la barra
 * con un disco cuentan el día completo sin un solo número.
 *
 * La interacción sigue siendo de un toque:
 *   toque en la tarjeta → cumplido. Otro toque la regresa a sin marcar.
 *   ✕ de la esquina     → no cumplido; se guarda YA y se ofrece el motivo
 *                         en una hoja que puedes ignorar (el registro ya quedó).
 *   + / −               → solo en hábitos con meta manual, para el avance parcial.
 *
 * Los hábitos con fuente automática (agua, sueño, gym) no se tocan: se llenan
 * con lo que capturas arriba en el día. Tocarlos te lleva a donde se captura.
 */

/** Color con el que se pinta el medidor según cómo va el hábito. */
function colorDe(habito: Habito, estado: EstadoHabito): string {
  if (estado === "cumplido") return "hsl(var(--mid-cumplido))";
  if (estado === "justificado") return "hsl(var(--mid-justificado))";
  if (estado === "fallado") return "hsl(var(--mid-fallado))";
  return COLOR_NATURAL[habito.visual] ?? "hsl(var(--primary))";
}

/** 0..1 de qué tan lleno va el medidor. Un binario cumplido llega lleno. */
export function progresoDe(habito: Habito, registro: RegistroHabito | undefined): number {
  if (registro?.cumplido) return 1;
  if (!habito.metaValor || habito.metaValor <= 0) return 0;
  const avance = registro?.avance ?? 0;
  return Math.max(0, Math.min(1, avance / habito.metaValor));
}

/** Texto corto del avance ("3/8 vasos"), o la racha si no hay meta. */
function textoAvance(habito: Habito, registro: RegistroHabito | undefined): string | null {
  if (!habito.metaValor) return null;
  const avance = registro?.cumplido ? habito.metaValor : (registro?.avance ?? 0);
  const limpio = Number(avance.toFixed(1));
  return `${limpio}/${habito.metaValor}${habito.unidad ? ` ${habito.unidad}` : ""}`;
}

/** A dónde manda tocar un hábito automático: al lugar donde ese dato SÍ se captura. */
const ANCLA_FUENTE: Record<string, { ancla: string; que: string }> = {
  agua: { ancla: "mid-agua", que: "los vasos de agua del día" },
  sueno: { ancla: "mid-sueno", que: "las horas de sueño del día" },
  gym: { ancla: "mid-gym", que: "tu sesión de gym" },
};

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
  const [motivoDe, setMotivoDe] = React.useState<Habito | null>(null);
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
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {delDia.map((habito) => (
            <TarjetaHabito
              key={habito.id}
              habito={habito}
              fecha={fecha}
              registro={registros.get(habito.id)}
              racha={rachas.get(habito.id) ?? 0}
              onCambio={onCambio}
              onPedirMotivo={() => setMotivoDe(habito)}
            />
          ))}
        </div>
      )}

      {descansando > 0 && delDia.length > 0 && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {descansando} {descansando === 1 ? "hábito no toca" : "hábitos no tocan"} hoy.
        </p>
      )}

      <HojaMotivo
        habito={motivoDe}
        fecha={fecha}
        registro={motivoDe ? registros.get(motivoDe.id) : undefined}
        onCerrar={() => setMotivoDe(null)}
        onCambio={onCambio}
      />
    </Tarjeta>
  );
}

function TarjetaHabito({
  habito,
  fecha,
  registro,
  racha,
  onCambio,
  onPedirMotivo,
}: {
  habito: Habito;
  fecha: ISODate;
  registro: RegistroHabito | undefined;
  racha: number;
  onCambio: (registro: RegistroHabito | null, habitoId: string) => void;
  onPedirMotivo: () => void;
}) {
  const [ocupado, setOcupado] = React.useState(false);
  const estado = estadoDe(habito, fecha, registro);
  const progreso = progresoDe(habito, registro);
  const color = colorDe(habito, estado);
  const automatico = habito.fuente !== "manual";
  const conMeta = Boolean(habito.metaValor) && !automatico;
  const avanceTexto = textoAvance(habito, registro);

  // Recién completado: dispara el rebote de la tarjeta una sola vez, no en cada
  // render (si no, cualquier cambio en otro hábito la volvería a animar).
  const [celebrar, setCelebrar] = React.useState(false);
  const estadoPrevio = React.useRef(estado);
  React.useEffect(() => {
    if (estado === "cumplido" && estadoPrevio.current !== "cumplido") {
      setCelebrar(true);
      const t = setTimeout(() => setCelebrar(false), 460);
      return () => clearTimeout(t);
    }
    estadoPrevio.current = estado;
  }, [estado]);
  estadoPrevio.current = estado;

  async function correr(accion: () => Promise<RegistroHabito | null>) {
    setOcupado(true);
    try {
      const resultado = await accion();
      onCambio(resultado, habito.id);
    } catch (err) {
      console.error("No se pudo guardar el hábito:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  }

  function vibrar() {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    try { navigator.vibrate(12); } catch { /* iOS Safari no la expone */ }
  }

  function alTocar() {
    if (automatico) {
      const destino = ANCLA_FUENTE[habito.fuente];
      if (destino) {
        document.getElementById(destino.ancla)?.scrollIntoView({ behavior: "smooth", block: "center" });
        toast(`"${habito.nombre}" se llena solo con ${destino.que}.`);
      }
      return;
    }
    if (estado === "cumplido") {
      void correr(async () => {
        await limpiarRegistro(habito.id, fecha);
        return null;
      });
      return;
    }
    vibrar();
    void correr(() => marcarHabito(habito, fecha, true, null, habito.metaValor));
  }

  function ajustar(delta: number) {
    if (!habito.metaValor) return;
    const actual = registro?.cumplido ? habito.metaValor : (registro?.avance ?? 0);
    const paso = habito.metaValor <= 12 ? 1 : Math.max(1, Math.round(habito.metaValor / 10));
    const siguiente = Math.max(0, Math.min(habito.metaValor, actual + delta * paso));
    if (siguiente === 0) {
      void correr(async () => {
        await limpiarRegistro(habito.id, fecha);
        return null;
      });
      return;
    }
    // Llegar a la meta marca cumplido solo — que es el punto de tener meta.
    const completo = siguiente >= habito.metaValor;
    if (completo) vibrar();
    void correr(() => marcarHabito(habito, fecha, completo, null, siguiente));
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center rounded-2xl border p-3 transition-all",
        celebrar && "mid-logrado",
        estado === "cumplido" && "border-[hsl(var(--mid-cumplido))]/45 bg-[hsl(var(--mid-cumplido))]/[0.07]",
        estado === "justificado" && "border-[hsl(var(--mid-justificado))]/45 bg-[hsl(var(--mid-justificado))]/[0.07]",
        estado === "fallado" && "border-[hsl(var(--mid-fallado))]/45 bg-[hsl(var(--mid-fallado))]/[0.07]",
        estado === "pendiente" && "border-border"
      )}
    >
      {/* El ✕ vive en la esquina y bajito: marcar que NO cumpliste debe ser
          posible sin ser lo primero que se ve. */}
      {!automatico && (
        <button
          type="button"
          disabled={ocupado}
          aria-label={`Marcar ${habito.nombre} como no cumplido`}
          onClick={() => {
            if (estado === "fallado" || estado === "justificado") {
              onPedirMotivo();
              return;
            }
            void correr(() => marcarHabito(habito, fecha, false, null, null)).then(onPedirMotivo);
          }}
          className={cn(
            "absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full transition-colors",
            estado === "fallado" || estado === "justificado"
              ? "text-[hsl(var(--mid-fallado))]"
              : "text-muted-foreground/25 hover:bg-secondary hover:text-foreground"
          )}
        >
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      )}

      {automatico && (
        <span
          className="absolute right-2 top-2 z-10 text-muted-foreground/35"
          title="Se llena solo con lo que registras en el día"
        >
          <Sparkles className="h-3 w-3" />
        </span>
      )}

      <button
        type="button"
        disabled={ocupado}
        onClick={alTocar}
        aria-pressed={estado === "cumplido"}
        aria-label={`${habito.nombre}${avanceTexto ? `, ${avanceTexto}` : ""}`}
        className="flex w-full flex-col items-center gap-1.5 pt-1 transition-transform active:scale-95 disabled:opacity-60"
        style={{ color }}
      >
        <Medidor visual={habito.visual} progreso={progreso} estado={estado} tamano={58} />
        <span className="mt-0.5 line-clamp-2 min-h-[2.1em] text-center text-[12.5px] font-semibold leading-tight text-foreground">
          {habito.nombre}
        </span>
      </button>

      <div className="mt-0.5 flex h-4 items-center gap-2 text-[10.5px] text-muted-foreground">
        {racha > 0 && (
          <span className="mid-num flex items-center gap-0.5 font-semibold text-[hsl(var(--mid-justificado))]">
            <Flame className="h-2.5 w-2.5" />
            {racha}
          </span>
        )}
        <span className="mid-num">{avanceTexto ?? `+${puntosDe(habito.dificultad)} pts`}</span>
      </div>

      {conMeta && (
        <div className="mt-1.5 flex w-full items-center justify-center gap-1">
          <button
            type="button"
            disabled={ocupado}
            aria-label="Quitar uno"
            onClick={() => ajustar(-1)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90 disabled:opacity-50"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={ocupado}
            aria-label="Sumar uno"
            onClick={() => ajustar(1)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * El motivo se pide DESPUÉS de guardar el "no cumplí", en una hoja que puedes
 * cerrar sin escribir nada: el registro ya quedó. Si esto fuera un diálogo
 * obligatorio, dejarías de marcar los días malos — justo los que más importa
 * registrar.
 */
function HojaMotivo({
  habito,
  fecha,
  registro,
  onCerrar,
  onCambio,
}: {
  habito: Habito | null;
  fecha: ISODate;
  registro: RegistroHabito | undefined;
  onCerrar: () => void;
  onCambio: (registro: RegistroHabito | null, habitoId: string) => void;
}) {
  const [motivo, setMotivo] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  React.useEffect(() => {
    if (habito) setMotivo(registro?.motivo ?? "");
  }, [habito, registro?.motivo]);

  async function guardar() {
    if (!habito) return;
    setGuardando(true);
    try {
      const nuevo = await marcarHabito(habito, fecha, false, motivo, null);
      onCambio(nuevo, habito.id);
      onCerrar();
    } catch (err) {
      console.error("No se pudo guardar el motivo:", err);
      toast.error("No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={Boolean(habito)} onOpenChange={(o) => !o && onCerrar()}>
      <SheetHeader
        title={habito ? `${habito.nombre}: no salió` : ""}
        description="Ya quedó registrado. Si escribes por qué, cuenta como excepción y no rompe la racha."
        onClose={onCerrar}
      />
      <textarea
        autoFocus
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej. hasta tarde en la escuela por el proyecto"
        className="w-full resize-none rounded-lg border border-input bg-surface px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-[hsl(var(--mid-justificado))]"
      />
      <SheetFooter>
        <Button size="lg" disabled={guardando} onClick={guardar}>
          {motivo.trim() ? "Guardar motivo" : "Dejarlo sin motivo"}
        </Button>
      </SheetFooter>
    </Sheet>
  );
}
