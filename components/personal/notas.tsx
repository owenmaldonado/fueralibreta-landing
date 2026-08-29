"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pin, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { actualizarNota, borrarNota, crearNota, obtenerNotas } from "@/lib/personal/api";
import type { Nota } from "@/lib/personal/tipos";
import { AreaCaja, CampoCaja } from "./campos";
import { EstadoVacio, Tarjeta } from "./piezas";
import { EncabezadoPantalla } from "./shell";

export function PantallaNotas() {
  const [notas, setNotas] = React.useState<Nota[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [busqueda, setBusqueda] = React.useState("");
  const [abierta, setAbierta] = React.useState<Nota | "nueva" | null>(null);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      setNotas(await obtenerNotas());
    } catch (err) {
      console.error("No se pudieron leer las notas:", err);
      toast.error("No se pudieron cargar las notas");
    } finally {
      setCargando(false);
    }
  }, []);

  React.useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = React.useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return notas;
    return notas.filter(
      (n) => (n.titulo ?? "").toLowerCase().includes(q) || (n.cuerpo ?? "").toLowerCase().includes(q)
    );
  }, [notas, busqueda]);

  async function alternarFijada(nota: Nota) {
    // Optimista, y reordenando: las fijadas van arriba.
    setNotas((lista) =>
      [...lista.map((n) => (n.id === nota.id ? { ...n, fijada: !n.fijada } : n))].sort(
        (a, b) => Number(b.fijada) - Number(a.fijada) || b.actualizadoEn.localeCompare(a.actualizadoEn)
      )
    );
    try {
      await actualizarNota(nota.id, { fijada: !nota.fijada });
    } catch (err) {
      console.error("No se pudo fijar la nota:", err);
      toast.error("No se pudo guardar");
      void cargar();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPantalla
        titulo="Notas"
        descripcion="Lo que no cabe en un día"
        accion={
          <Button size="sm" onClick={() => setAbierta("nueva")}>
            <Plus className="h-4 w-4" /> Nueva
          </Button>
        }
      />

      {notas.length > 3 && (
        <div className="flex h-11 items-center gap-2 rounded-lg border border-input bg-surface px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en tus notas"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      )}

      {cargando ? (
        <Tarjeta>
          <EstadoVacio>Cargando…</EstadoVacio>
        </Tarjeta>
      ) : filtradas.length === 0 ? (
        <Tarjeta>
          <EstadoVacio className="py-8">
            {busqueda ? "Nada con esa búsqueda." : "Sin notas todavía."}
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-2">
          {filtradas.map((n) => (
            <Tarjeta key={n.id} className={cn("p-0", n.fijada && "border-primary/40")}>
              <div className="flex items-start gap-2 p-4">
                <button type="button" onClick={() => setAbierta(n)} className="min-w-0 flex-1 text-left">
                  <p className="mid-display truncate text-[16px]">{n.titulo || "Sin título"}</p>
                  {n.cuerpo && (
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                      {n.cuerpo}
                    </p>
                  )}
                  <p className="mid-num mt-2 text-[10px] text-muted-foreground/70">
                    {n.actualizadoEn.slice(0, 10)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => alternarFijada(n)}
                  aria-label={n.fijada ? "Quitar de fijadas" : "Fijar arriba"}
                  className={cn(
                    "shrink-0 rounded-full p-1.5 transition-colors",
                    n.fijada ? "text-primary" : "text-muted-foreground/40 hover:text-foreground"
                  )}
                >
                  <Pin className={cn("h-4 w-4", n.fijada && "fill-current")} />
                </button>
              </div>
            </Tarjeta>
          ))}
        </div>
      )}

      <HojaNota
        nota={abierta}
        onCerrar={() => setAbierta(null)}
        onGuardado={() => {
          setAbierta(null);
          void cargar();
        }}
      />
    </div>
  );
}

function HojaNota({
  nota,
  onCerrar,
  onGuardado,
}: {
  nota: Nota | "nueva" | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const actual = nota && nota !== "nueva" ? nota : null;
  const [titulo, setTitulo] = React.useState("");
  const [cuerpo, setCuerpo] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState(false);

  React.useEffect(() => {
    if (!nota) return;
    setTitulo(actual?.titulo ?? "");
    setCuerpo(actual?.cuerpo ?? "");
    setConfirmando(false);
  }, [nota, actual]);

  async function guardar() {
    if (!titulo.trim() && !cuerpo.trim()) return;
    setGuardando(true);
    try {
      if (actual) await actualizarNota(actual.id, { titulo: titulo.trim() || null, cuerpo: cuerpo.trim() || null });
      else await crearNota(titulo.trim(), cuerpo.trim());
      onGuardado();
    } catch (err) {
      console.error("No se pudo guardar la nota:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!actual) return;
    setGuardando(true);
    try {
      await borrarNota(actual.id);
      onGuardado();
    } catch (err) {
      console.error("No se pudo borrar la nota:", err);
      toast.error("No se pudo borrar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={Boolean(nota)} onOpenChange={(o) => !o && onCerrar()}>
      <SheetHeader title={actual ? "Nota" : "Nueva nota"} onClose={onCerrar} />
      <div className="flex flex-col gap-3">
        <CampoCaja
          autoFocus={!actual}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título"
          className="mid-display text-[17px]"
        />
        <AreaCaja
          rows={10}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          placeholder="Escribe lo que quieras…"
        />
      </div>
      <SheetFooter>
        <Button size="lg" disabled={guardando || (!titulo.trim() && !cuerpo.trim())} onClick={guardar}>
          Guardar
        </Button>
        {actual && !confirmando && (
          <Button size="lg" variant="ghost" className="text-destructive" onClick={() => setConfirmando(true)}>
            <Trash2 className="h-4 w-4" /> Borrar nota
          </Button>
        )}
        {actual && confirmando && (
          <div className="flex gap-2">
            <Button size="lg" variant="outline" className="flex-1" onClick={() => setConfirmando(false)}>
              Mejor no
            </Button>
            <Button size="lg" variant="destructive" className="flex-1" disabled={guardando} onClick={eliminar}>
              Borrar
            </Button>
          </div>
        )}
      </SheetFooter>
    </Sheet>
  );
}
