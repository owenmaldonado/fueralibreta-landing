"use client";

import * as React from "react";
import { toast } from "sonner";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { borrarRutina, crearRutina, guardarEjerciciosDeRutina, renombrarRutina } from "@/lib/personal/api";
import type { Rutina } from "@/lib/personal/tipos";
import { CampoCaja } from "./campos";
import { EstadoVacio, Tarjeta } from "./piezas";

interface Renglon {
  nombre: string;
  series: string;
  reps: string;
}

const RENGLON_VACIO: Renglon = { nombre: "", series: "3", reps: "10" };

/**
 * Rutinas = plantillas. No guardan pesos (esos cambian cada semana), solo qué
 * ejercicios y cuántas series/reps apuntas. Empezar una sesión desde una
 * rutina crea los ejercicios y las series vacías de un jalón, y en el gym solo
 * tecleas números.
 */
export function PanelRutinas({ rutinas, onCambio }: { rutinas: Rutina[]; onCambio: () => void }) {
  const [editando, setEditando] = React.useState<Rutina | "nueva" | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {rutinas.length === 0 ? (
        <Tarjeta>
          <EstadoVacio>
            Sin rutinas todavía. Crea &ldquo;Torso&rdquo;, &ldquo;Pierna&rdquo; o como le llames a tus días.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        rutinas.map((r) => (
          <Tarjeta key={r.id}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="mid-display text-[17px]">{r.nombre}</h3>
              <button
                type="button"
                onClick={() => setEditando(r)}
                aria-label={`Editar ${r.nombre}`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            {r.ejercicios.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Sin ejercicios.</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {r.ejercicios.map((e, i) => (
                  <li key={e.id} className="flex items-baseline gap-2 text-[14px]">
                    <span className="mid-num w-4 shrink-0 text-[11px] text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{e.nombre}</span>
                    <span className="mid-num shrink-0 text-[12px] text-muted-foreground">
                      {e.seriesObjetivo}×{e.repsObjetivo}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Tarjeta>
        ))
      )}

      <Button variant="outline" size="lg" onClick={() => setEditando("nueva")}>
        <Plus className="h-4 w-4" /> Nueva rutina
      </Button>

      <HojaRutina
        rutina={editando}
        onCerrar={() => setEditando(null)}
        onGuardado={() => {
          setEditando(null);
          onCambio();
        }}
      />
    </div>
  );
}

function HojaRutina({
  rutina,
  onCerrar,
  onGuardado,
}: {
  rutina: Rutina | "nueva" | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const actual = rutina && rutina !== "nueva" ? rutina : null;
  const [nombre, setNombre] = React.useState("");
  const [renglones, setRenglones] = React.useState<Renglon[]>([{ ...RENGLON_VACIO }]);
  const [guardando, setGuardando] = React.useState(false);

  React.useEffect(() => {
    if (!rutina) return;
    setNombre(actual?.nombre ?? "");
    setRenglones(
      actual && actual.ejercicios.length > 0
        ? actual.ejercicios.map((e) => ({
            nombre: e.nombre,
            series: String(e.seriesObjetivo),
            reps: String(e.repsObjetivo),
          }))
        : [{ ...RENGLON_VACIO }]
    );
  }, [rutina, actual]);

  function cambiar(i: number, campo: keyof Renglon, valor: string) {
    setRenglones((lista) => lista.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)));
  }

  const ejerciciosLimpios = renglones
    .filter((r) => r.nombre.trim())
    .map((r) => ({
      nombre: r.nombre.trim(),
      seriesObjetivo: Math.max(1, Number(r.series) || 3),
      repsObjetivo: Math.max(1, Number(r.reps) || 10),
    }));

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      if (actual) {
        await renombrarRutina(actual.id, nombre.trim());
        await guardarEjerciciosDeRutina(actual.id, ejerciciosLimpios);
      } else {
        await crearRutina(nombre.trim(), ejerciciosLimpios);
      }
      onGuardado();
    } catch (err) {
      console.error("No se pudo guardar la rutina:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la rutina");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!actual) return;
    setGuardando(true);
    try {
      await borrarRutina(actual.id);
      toast.success(`"${actual.nombre}" archivada — tus sesiones pasadas no se tocan`);
      onGuardado();
    } catch (err) {
      console.error("No se pudo borrar la rutina:", err);
      toast.error("No se pudo borrar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={Boolean(rutina)} onOpenChange={(o) => !o && onCerrar()}>
      <SheetHeader
        title={actual ? "Editar rutina" : "Nueva rutina"}
        description="Los pesos no van aquí — esos se capturan en cada sesión."
        onClose={onCerrar}
      />

      <div className="flex flex-col gap-3">
        <CampoCaja
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre (ej. Torso A)"
        />

        <div className="flex flex-col gap-2">
          {renglones.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
              <CampoCaja
                value={r.nombre}
                onChange={(e) => cambiar(i, "nombre", e.target.value)}
                placeholder="Ejercicio"
                className="flex-1"
              />
              <input
                value={r.series}
                inputMode="numeric"
                onChange={(e) => cambiar(i, "series", e.target.value.replace(/\D/g, ""))}
                aria-label="Series objetivo"
                className="mid-num h-11 w-11 shrink-0 rounded-lg border border-input bg-surface text-center text-[15px] outline-none focus:border-primary/70"
              />
              <span className="shrink-0 text-muted-foreground">×</span>
              <input
                value={r.reps}
                inputMode="numeric"
                onChange={(e) => cambiar(i, "reps", e.target.value.replace(/\D/g, ""))}
                aria-label="Repeticiones objetivo"
                className="mid-num h-11 w-11 shrink-0 rounded-lg border border-input bg-surface text-center text-[15px] outline-none focus:border-primary/70"
              />
              <button
                type="button"
                onClick={() => setRenglones((l) => (l.length === 1 ? [{ ...RENGLON_VACIO }] : l.filter((_, idx) => idx !== i)))}
                aria-label="Quitar ejercicio"
                className="shrink-0 rounded-full p-1.5 text-muted-foreground/50 transition-colors hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRenglones((l) => [...l, { ...RENGLON_VACIO }])}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Otro ejercicio
        </button>
      </div>

      <SheetFooter>
        <Button size="lg" disabled={!nombre.trim() || guardando} onClick={guardar}>
          {actual ? "Guardar cambios" : "Crear rutina"}
        </Button>
        {actual && (
          <Button size="lg" variant="ghost" className="text-destructive" disabled={guardando} onClick={eliminar}>
            <Trash2 className="h-4 w-4" /> Borrar rutina
          </Button>
        )}
      </SheetFooter>
    </Sheet>
  );
}
