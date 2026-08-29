"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, Medal, Plus, RotateCcw, Timer, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  actualizarSesion, agregarEjercicioASesion, borrarEjercicio, borrarSerie, borrarSesion, guardarSerie,
} from "@/lib/personal/api";
import { formatoLargo } from "@/lib/personal/fechas";
import { marcasPorEjercicio, normalizarEjercicio, resumirSesion, type MarcaEjercicio } from "@/lib/personal/gym";
import { unoRMEstimado } from "@/lib/personal/reglas";
import type { EjercicioSesion, Serie, Sesion } from "@/lib/personal/tipos";
import { CampoCaja } from "./campos";
import { EscalaBarras, Tarjeta } from "./piezas";

const RETARDO_SERIE_MS = 600;

/**
 * Registro de una sesión. Está pensado para usarse EN EL GYM, con una mano y
 * entre serie y serie:
 *  - "Añadir serie" copia peso y reps de la serie anterior. La segunda serie
 *    casi siempre es igual que la primera; teclearla de nuevo cada vez es la
 *    razón por la que la gente deja de registrar.
 *  - Cada ejercicio muestra "la vez pasada" con los números reales, para saber
 *    contra qué estás compitiendo sin salir a buscarlo.
 *  - Si una serie rompe tu mejor marca (por 1RM estimado), aparece la medalla
 *    en el momento, no en una pantalla de estadísticas que nadie abre.
 */
export function EditorSesion({
  sesion,
  historial,
  onCambio,
  onCerrar,
}: {
  sesion: Sesion;
  /** Todas las sesiones cargadas, para calcular récords y "la vez pasada". */
  historial: Sesion[];
  onCambio: () => void;
  onCerrar: () => void;
}) {
  const [duracion, setDuracion] = React.useState<string>(sesion.duracionMin?.toString() ?? "");
  const [sensacion, setSensacion] = React.useState<number | null>(sesion.sensacion);
  const [notas, setNotas] = React.useState(sesion.notas ?? "");
  const [nuevoEjercicio, setNuevoEjercicio] = React.useState("");
  const [confirmando, setConfirmando] = React.useState(false);

  // Marcas ANTERIORES a esta sesión: contra eso se mide si hoy hubo récord.
  const marcasPrevias = React.useMemo(
    () => marcasPorEjercicio(historial, sesion.fecha),
    [historial, sesion.fecha]
  );

  const resumen = resumirSesion(sesion);

  async function guardarCampo(cambios: Parameters<typeof actualizarSesion>[1]) {
    try {
      await actualizarSesion(sesion.id, cambios);
    } catch (err) {
      console.error("No se pudo actualizar la sesión:", err);
      toast.error("No se pudo guardar");
    }
  }

  async function agregarEjercicio(nombre: string) {
    const limpio = nombre.trim();
    if (!limpio) return;
    try {
      await agregarEjercicioASesion(sesion.id, limpio, sesion.ejercicios.length);
      setNuevoEjercicio("");
      onCambio();
    } catch (err) {
      console.error("No se pudo agregar el ejercicio:", err);
      toast.error("No se pudo agregar el ejercicio");
    }
  }

  async function eliminarSesion() {
    try {
      await borrarSesion(sesion.id);
      toast.success("Sesión borrada");
      onCerrar();
      onCambio();
    } catch (err) {
      console.error("No se pudo borrar la sesión:", err);
      toast.error("No se pudo borrar");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCerrar}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Volver"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="mid-titulo truncate text-[24px]">{sesion.nombre}</h1>
          <p className="text-[12px] text-muted-foreground">{formatoLargo(sesion.fecha)}</p>
        </div>
      </div>

      <Tarjeta>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Dato etiqueta="Ejercicios" valor={String(resumen.ejercicios)} />
          <Dato etiqueta="Series" valor={String(resumen.series)} />
          <Dato
            etiqueta="Volumen"
            valor={resumen.volumen > 0 ? `${Math.round(resumen.volumen).toLocaleString("es-MX")} kg` : "—"}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3">
          <div>
            <p className="mid-etiqueta mb-1.5 flex items-center gap-1">
              <Timer className="h-3 w-3" /> Duración
            </p>
            <div className="flex items-center gap-1.5">
              <input
                value={duracion}
                inputMode="numeric"
                onChange={(e) => setDuracion(e.target.value.replace(/\D/g, ""))}
                onBlur={() => guardarCampo({ duracionMin: duracion ? Number(duracion) : null })}
                placeholder="—"
                className="mid-num h-9 w-14 rounded-lg border border-input bg-surface px-2 text-center text-[15px] font-semibold outline-none focus:border-primary/70"
              />
              <span className="text-[13px] text-muted-foreground">min</span>
            </div>
          </div>
          <div>
            <p className="mid-etiqueta mb-1.5">Cómo se sintió</p>
            <EscalaBarras
              valor={sensacion}
              onChange={(v) => {
                setSensacion(v);
                void guardarCampo({ sensacion: v });
              }}
            />
          </div>
        </div>
      </Tarjeta>

      {sesion.ejercicios.map((ejercicio) => (
        <BloqueEjercicio
          key={ejercicio.id}
          ejercicio={ejercicio}
          marcaPrevia={marcasPrevias.get(normalizarEjercicio(ejercicio.nombre)) ?? null}
          onCambio={onCambio}
        />
      ))}

      <Tarjeta>
        <p className="mid-etiqueta mb-2">Agregar ejercicio</p>
        <div className="flex gap-2">
          <CampoCaja
            value={nuevoEjercicio}
            onChange={(e) => setNuevoEjercicio(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregarEjercicio(nuevoEjercicio)}
            placeholder="Ej. Press banca"
            list="mid-ejercicios-conocidos"
          />
          <Button disabled={!nuevoEjercicio.trim()} onClick={() => agregarEjercicio(nuevoEjercicio)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {/* Autocompletado nativo con lo que ya has entrenado: sin JS extra y
            con el teclado del sistema, que en móvil es lo que se siente bien. */}
        <datalist id="mid-ejercicios-conocidos">
          {[...marcasPrevias.values()].map((m) => (
            <option key={m.nombre} value={m.nombre} />
          ))}
        </datalist>
      </Tarjeta>

      <Tarjeta>
        <p className="mid-etiqueta mb-1.5">Notas de la sesión</p>
        <textarea
          value={notas}
          rows={2}
          onChange={(e) => setNotas(e.target.value)}
          onBlur={() => guardarCampo({ notas: notas.trim() || null })}
          placeholder="Cómo te fue, molestias, qué cambiar la próxima…"
          className="w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
      </Tarjeta>

      {confirmando ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-[13px]">Se borra la sesión completa con todos sus ejercicios y series.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmando(false)}>
              Mejor no
            </Button>
            <Button size="sm" variant="destructive" className="flex-1" onClick={eliminarSesion}>
              Borrar sesión
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="flex items-center justify-center gap-2 py-2 text-[13px] text-muted-foreground transition-colors hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Borrar esta sesión
        </button>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="mid-etiqueta">{etiqueta}</p>
      <p className="mid-num mid-display mt-0.5 text-[19px]">{valor}</p>
    </div>
  );
}

function BloqueEjercicio({
  ejercicio,
  marcaPrevia,
  onCambio,
}: {
  ejercicio: EjercicioSesion;
  marcaPrevia: MarcaEjercicio | null;
  onCambio: () => void;
}) {
  const [borrando, setBorrando] = React.useState(false);
  const recordPrevio = marcaPrevia?.mejorSerie?.unoRM ?? 0;
  const anteriores = marcaPrevia?.ultimaVez?.series ?? [];

  async function agregarSerie() {
    const ultima = ejercicio.series[ejercicio.series.length - 1];
    try {
      await guardarSerie({
        ejercicioId: ejercicio.id,
        numero: ejercicio.series.length + 1,
        // Copia la serie anterior: en la práctica la siguiente serie es la
        // misma, y ajustar un número es más rápido que escribir dos.
        pesoKg: ultima?.pesoKg ?? null,
        repeticiones: ultima?.repeticiones ?? null,
      });
      onCambio();
    } catch (err) {
      console.error("No se pudo agregar la serie:", err);
      toast.error("No se pudo agregar la serie");
    }
  }

  async function quitarEjercicio() {
    setBorrando(true);
    try {
      await borrarEjercicio(ejercicio.id);
      onCambio();
    } catch (err) {
      console.error("No se pudo borrar el ejercicio:", err);
      toast.error("No se pudo borrar");
      setBorrando(false);
    }
  }

  return (
    <Tarjeta>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="mid-display truncate text-[17px]">{ejercicio.nombre}</h3>
          {marcaPrevia?.ultimaVez && (
            <p className="mid-num mt-0.5 text-[11px] text-muted-foreground">
              La vez pasada:{" "}
              {marcaPrevia.ultimaVez.series
                .map((s) => `${formatearPeso(s.pesoKg)}×${s.repeticiones ?? "?"}`)
                .join(" · ")}
            </p>
          )}
          {marcaPrevia?.mejorSerie && (
            <p className="mid-num text-[11px] text-muted-foreground">
              Tu marca: {formatearPeso(marcaPrevia.mejorSerie.pesoKg)} kg × {marcaPrevia.mejorSerie.repeticiones}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={borrando}
          onClick={quitarEjercicio}
          aria-label={`Quitar ${ejercicio.nombre}`}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {ejercicio.series.map((serie, i) => (
          <FilaSerie
            key={serie.id}
            serie={serie}
            recordPrevio={recordPrevio}
            // El "fantasma": la serie equivalente de la última vez que hiciste
            // este ejercicio. Se empareja por posición (serie 1 con serie 1); si
            // aquella vez hiciste menos series, se repite la última, que es lo
            // que en la práctica seguirías levantando.
            sugerencia={
              anteriores.length === 0 ? null : anteriores[Math.min(i, anteriores.length - 1)]
            }
            onCambio={onCambio}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={agregarSerie}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        {ejercicio.series.length === 0 ? "Primera serie" : "Otra serie"}
      </button>
    </Tarjeta>
  );
}

function formatearPeso(peso: number | null): string {
  if (peso == null) return "?";
  return String(Number(peso.toFixed(2)));
}

function FilaSerie({
  serie,
  recordPrevio,
  sugerencia,
  onCambio,
}: {
  serie: Serie;
  recordPrevio: number;
  /** Lo que levantaste en esta misma serie la vez pasada. Se muestra en gris como fantasma. */
  sugerencia: Serie | null;
  onCambio: () => void;
}) {
  const [peso, setPeso] = React.useState(serie.pesoKg == null ? "" : formatearPeso(serie.pesoKg));
  const [reps, setReps] = React.useState(serie.repeticiones == null ? "" : String(serie.repeticiones));
  const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Lo que falta por mandar. Se vacía al guardar; si sigue lleno al desmontar, se manda ahí mismo. */
  const pendiente = React.useRef<{ peso: string; reps: string } | null>(null);

  React.useEffect(() => {
    setPeso(serie.pesoKg == null ? "" : formatearPeso(serie.pesoKg));
    setReps(serie.repeticiones == null ? "" : String(serie.repeticiones));
  }, [serie.pesoKg, serie.repeticiones]);

  const pesoNum = peso === "" ? null : Number(peso.replace(",", "."));
  const repsNum = reps === "" ? null : Number(reps);
  const rm = unoRMEstimado(pesoNum, repsNum);
  const esRecord = rm > 0 && rm > recordPrevio;
  const vacia = peso === "" && reps === "";

  // Se declara con useCallback y se referencia desde el efecto de limpieza:
  // sin esto, salir del ejercicio (o recargar la lista al agregar una serie)
  // antes de que corriera el debounce se llevaba el último peso tecleado.
  const enviar = React.useCallback(async () => {
    const datos = pendiente.current;
    if (!datos) return;
    pendiente.current = null;
    try {
      await guardarSerie({
        id: serie.id,
        ejercicioId: serie.ejercicioId,
        numero: serie.numero,
        pesoKg: datos.peso === "" ? null : Number(datos.peso.replace(",", ".")),
        repeticiones: datos.reps === "" ? null : Number(datos.reps),
      });
    } catch (err) {
      console.error("No se pudo guardar la serie:", err);
      toast.error("No se pudo guardar la serie");
    }
  }, [serie.id, serie.ejercicioId, serie.numero]);

  React.useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      void enviar();
    };
  }, [enviar]);

  function programarGuardado(nuevoPeso: string, nuevasReps: string) {
    pendiente.current = { peso: nuevoPeso, reps: nuevasReps };
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void enviar(), RETARDO_SERIE_MS);
  }

  async function eliminar() {
    if (temporizador.current) clearTimeout(temporizador.current);
    pendiente.current = null;
    try {
      await borrarSerie(serie.id);
      onCambio();
    } catch (err) {
      console.error("No se pudo borrar la serie:", err);
      toast.error("No se pudo borrar la serie");
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
        esRecord ? "bg-primary/10 ring-1 ring-primary/40" : "bg-secondary/40"
      )}
    >
      <span className="mid-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-bold text-muted-foreground">
        {serie.numero}
      </span>

      <input
        value={peso}
        inputMode="decimal"
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.,]/g, "");
          setPeso(v);
          programarGuardado(v, reps);
        }}
        placeholder={sugerencia?.pesoKg != null ? formatearPeso(sugerencia.pesoKg) : "0"}
        aria-label={`Peso de la serie ${serie.numero}`}
        className="mid-num h-9 w-16 rounded-md border border-input bg-surface px-2 text-center text-[15px] font-semibold outline-none focus:border-primary/70"
      />
      <span className="text-[12px] text-muted-foreground">kg</span>

      <span className="text-muted-foreground">×</span>

      <input
        value={reps}
        inputMode="numeric"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "");
          setReps(v);
          programarGuardado(peso, v);
        }}
        placeholder={sugerencia?.repeticiones != null ? String(sugerencia.repeticiones) : "0"}
        aria-label={`Repeticiones de la serie ${serie.numero}`}
        className="mid-num h-9 w-14 rounded-md border border-input bg-surface px-2 text-center text-[15px] font-semibold outline-none focus:border-primary/70"
      />
      <span className="text-[12px] text-muted-foreground">reps</span>

      {/* Fila vacía con fantasma: un toque copia lo de la vez pasada. Escribir
          encima ignora el fantasma, así que sugerir nunca ensucia el registro:
          lo que se guarda siempre es lo que tú pusiste. */}
      {vacia && sugerencia && (
        <button
          type="button"
          onClick={() => {
            const p = sugerencia.pesoKg != null ? formatearPeso(sugerencia.pesoKg) : "";
            const r = sugerencia.repeticiones != null ? String(sugerencia.repeticiones) : "";
            setPeso(p);
            setReps(r);
            programarGuardado(p, r);
          }}
          title="Usar lo de la vez pasada"
          className="ml-auto flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-[10.5px] text-muted-foreground/70 transition-colors hover:border-primary/60 hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          igual
        </button>
      )}

      {esRecord && (
        <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-primary" title="Rompe tu mejor marca en este ejercicio">
          <Medal className="h-3.5 w-3.5" /> Récord
        </span>
      )}

      <button
        type="button"
        onClick={eliminar}
        aria-label={`Borrar serie ${serie.numero}`}
        className={cn(
          "shrink-0 rounded-full p-1 text-muted-foreground/40 transition-colors hover:bg-background hover:text-destructive",
          !esRecord && !(vacia && sugerencia) && "ml-auto"
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
