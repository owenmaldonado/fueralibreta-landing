"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Clock, MapPin, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { actualizarEvento, borrarEvento, crearEvento, obtenerEventos } from "@/lib/personal/api";
import { soloHora, type ISODate } from "@/lib/personal/fechas";
import type { Evento } from "@/lib/personal/tipos";
import { AreaCaja, CampoCaja } from "./campos";
import { EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";

/** Colores por clave, no hex sueltos: así el mismo evento se ve bien en modo noche y en papel. */
export const PALETA_EVENTO = [
  { clave: "ambar", css: "hsl(var(--primary))", etiqueta: "Ámbar" },
  { clave: "verde", css: "hsl(var(--mid-cumplido))", etiqueta: "Verde" },
  { clave: "azul", css: "hsl(205 80% 55%)", etiqueta: "Azul" },
  { clave: "morado", css: "hsl(270 60% 62%)", etiqueta: "Morado" },
  { clave: "rojo", css: "hsl(var(--mid-fallado))", etiqueta: "Rojo" },
];

export function colorEvento(clave: string | null): string {
  return PALETA_EVENTO.find((c) => c.clave === clave)?.css ?? "hsl(var(--muted-foreground))";
}

export function BloqueAgenda({ fecha }: { fecha: ISODate }) {
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [editando, setEditando] = React.useState<Evento | "nuevo" | null>(null);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      setEventos(await obtenerEventos(fecha, fecha));
    } catch (err) {
      console.error("No se pudo leer la agenda:", err);
      toast.error("No se pudo cargar la agenda");
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  React.useEffect(() => {
    void cargar();
  }, [cargar]);

  async function alternarHecho(ev: Evento) {
    // Optimista: el check no debe esperar a la red.
    setEventos((lista) => lista.map((e) => (e.id === ev.id ? { ...e, hecho: !e.hecho } : e)));
    try {
      await actualizarEvento(ev.id, { hecho: !ev.hecho });
    } catch (err) {
      console.error("No se pudo actualizar el evento:", err);
      setEventos((lista) => lista.map((e) => (e.id === ev.id ? { ...e, hecho: ev.hecho } : e)));
      toast.error("No se pudo actualizar");
    }
  }

  return (
    <Tarjeta>
      <TituloTarjeta
        accion={
          <button
            type="button"
            onClick={() => setEditando("nuevo")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Agregar al día"
          >
            <Plus className="h-4 w-4" />
          </button>
        }
      >
        Agenda
      </TituloTarjeta>

      {cargando ? (
        <EstadoVacio>Cargando…</EstadoVacio>
      ) : eventos.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditando("nuevo")}
          className="w-full rounded-lg border border-dashed border-border py-5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          Nada agendado. Toca para agregar algo.
        </button>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {eventos.map((ev) => (
            <li key={ev.id} className="flex items-center gap-3">
              <button
                type="button"
                aria-label={ev.hecho ? "Marcar como pendiente" : "Marcar como hecho"}
                onClick={() => alternarHecho(ev)}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all active:scale-90",
                  ev.hecho ? "border-transparent text-white" : "border-border text-transparent hover:border-primary/60"
                )}
                style={ev.hecho ? { background: colorEvento(ev.color) } : undefined}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </button>

              <button
                type="button"
                onClick={() => setEditando(ev)}
                className="flex min-w-0 flex-1 items-baseline gap-2.5 py-2 text-left"
              >
                <span className="mid-num w-11 shrink-0 text-[12px] font-semibold text-muted-foreground">
                  {soloHora(ev.horaInicio) || "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[15px]", ev.hecho && "text-muted-foreground line-through")}>
                    {ev.titulo}
                  </span>
                  {ev.lugar && (
                    <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" /> {ev.lugar}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <HojaEvento
        fecha={fecha}
        evento={editando}
        onCerrar={() => setEditando(null)}
        onGuardado={() => {
          setEditando(null);
          void cargar();
        }}
      />
    </Tarjeta>
  );
}

function HojaEvento({
  fecha,
  evento,
  onCerrar,
  onGuardado,
}: {
  fecha: ISODate;
  evento: Evento | "nuevo" | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const esNuevo = evento === "nuevo";
  const actual = evento && evento !== "nuevo" ? evento : null;

  const [titulo, setTitulo] = React.useState("");
  const [horaInicio, setHoraInicio] = React.useState("");
  const [horaFin, setHoraFin] = React.useState("");
  const [lugar, setLugar] = React.useState("");
  const [notas, setNotas] = React.useState("");
  const [color, setColor] = React.useState<string>("ambar");
  const [guardando, setGuardando] = React.useState(false);

  React.useEffect(() => {
    if (!evento) return;
    setTitulo(actual?.titulo ?? "");
    setHoraInicio(soloHora(actual?.horaInicio));
    setHoraFin(soloHora(actual?.horaFin));
    setLugar(actual?.lugar ?? "");
    setNotas(actual?.notas ?? "");
    setColor(actual?.color ?? "ambar");
  }, [evento, actual]);

  async function guardar() {
    if (!titulo.trim()) return;
    setGuardando(true);
    try {
      const datos = {
        fecha,
        titulo: titulo.trim(),
        horaInicio: horaInicio || null,
        horaFin: horaFin || null,
        lugar: lugar.trim() || null,
        notas: notas.trim() || null,
        color,
      };
      if (actual) await actualizarEvento(actual.id, datos);
      else await crearEvento(datos);
      onGuardado();
    } catch (err) {
      console.error("No se pudo guardar el evento:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!actual) return;
    setGuardando(true);
    try {
      await borrarEvento(actual.id);
      onGuardado();
    } catch (err) {
      console.error("No se pudo borrar el evento:", err);
      toast.error("No se pudo borrar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={Boolean(evento)} onOpenChange={(o) => !o && onCerrar()}>
      <SheetHeader title={esNuevo ? "Nuevo en la agenda" : "Editar"} onClose={onCerrar} />
      <div className="flex flex-col gap-3">
        <CampoCaja
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="¿Qué tienes que hacer?"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-input bg-surface px-3">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className="mid-num h-11 w-full bg-transparent text-[15px] outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-input bg-surface px-3">
            <span className="mid-etiqueta shrink-0">fin</span>
            <input
              type="time"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              className="mid-num h-11 w-full bg-transparent text-[15px] outline-none"
            />
          </label>
        </div>
        <CampoCaja value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Lugar (opcional)" />
        <AreaCaja rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional)" />

        <div className="flex items-center gap-2">
          {PALETA_EVENTO.map((c) => (
            <button
              key={c.clave}
              type="button"
              aria-label={c.etiqueta}
              aria-pressed={color === c.clave}
              onClick={() => setColor(c.clave)}
              className={cn(
                "h-7 w-7 rounded-full transition-transform",
                color === c.clave ? "scale-110 ring-2 ring-foreground/70 ring-offset-2 ring-offset-card" : "opacity-60"
              )}
              style={{ background: c.css }}
            />
          ))}
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!titulo.trim() || guardando} onClick={guardar}>
          {actual ? "Guardar cambios" : "Agregar"}
        </Button>
        {actual && (
          <Button size="lg" variant="ghost" className="text-destructive" disabled={guardando} onClick={eliminar}>
            <Trash2 className="h-4 w-4" /> Borrar
          </Button>
        )}
      </SheetFooter>
    </Sheet>
  );
}
