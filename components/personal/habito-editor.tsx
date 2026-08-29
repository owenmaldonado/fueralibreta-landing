"use client";

import * as React from "react";
import { toast } from "sonner";
import { Archive, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { actualizarHabito, archivarHabito, borrarHabito, crearHabito } from "@/lib/personal/api";
import { CATEGORIAS_HABITO } from "@/lib/personal/categorias";
import { DIAS_CORTOS } from "@/lib/personal/fechas";
import { ETIQUETA_DIFICULTAD, PUNTOS_POR_DIFICULTAD } from "@/lib/personal/reglas";
import type { Dificultad, FuenteHabito, Habito, VisualHabito } from "@/lib/personal/tipos";
import { CampoCaja } from "./campos";
import { CATALOGO_MEDIDORES, COLOR_NATURAL, Medidor } from "./medidores";

const DIFICULTADES: Dificultad[] = ["facil", "media", "dificil"];

/** Orden de la semana en pantalla: lunes primero, como la tira de Hoy. 0=domingo en la base. */
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

/**
 * De dónde sale el avance. Elegir una fuente automática también propone el
 * medidor y la unidad que le quedan: nadie quiere configurar "agua" y luego
 * escoger a mano que se dibuje con vasos.
 */
const FUENTES: {
  clave: FuenteHabito;
  etiqueta: string;
  detalle: string;
  visual?: VisualHabito;
  meta?: number;
  unidad?: string;
}[] = [
  { clave: "manual", etiqueta: "Lo marco yo", detalle: "Un toque en la tarjeta" },
  { clave: "agua", etiqueta: "El agua del día", detalle: "Se llena con los vasos que registras", visual: "vasos", meta: 8, unidad: "vasos" },
  { clave: "sueno", etiqueta: "Las horas de sueño", detalle: "Se cumple al llegar a la meta", visual: "luna", meta: 7, unidad: "h" },
  { clave: "gym", etiqueta: "Mi sesión de gym", detalle: "Se cumple si registraste entrenamiento", visual: "pesas" },
];

export function EditorHabito({
  abierto,
  habito,
  ordenSiguiente,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  /** null = crear uno nuevo. */
  habito: Habito | null;
  ordenSiguiente: number;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = React.useState("");
  const [categoria, setCategoria] = React.useState<string | null>(null);
  const [dificultad, setDificultad] = React.useState<Dificultad>("media");
  const [dias, setDias] = React.useState<number[] | null>(null);
  const [visual, setVisual] = React.useState<VisualHabito>("anillo");
  const [fuente, setFuente] = React.useState<FuenteHabito>("manual");
  const [meta, setMeta] = React.useState("");
  const [unidad, setUnidad] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = React.useState(false);

  React.useEffect(() => {
    if (!abierto) return;
    setNombre(habito?.nombre ?? "");
    setCategoria(habito?.categoria ?? null);
    setDificultad(habito?.dificultad ?? "media");
    setDias(habito?.diasSemana ?? null);
    setVisual(habito?.visual ?? "anillo");
    setFuente(habito?.fuente ?? "manual");
    setMeta(habito?.metaValor != null ? String(habito.metaValor) : "");
    setUnidad(habito?.unidad ?? "");
    setConfirmandoBorrado(false);
  }, [abierto, habito]);

  function elegirFuente(f: (typeof FUENTES)[number]) {
    setFuente(f.clave);
    if (f.visual) setVisual(f.visual);
    if (f.meta != null) setMeta(String(f.meta));
    if (f.unidad != null) setUnidad(f.unidad);
    // El gym es sí/no: no hay meta que llenar.
    if (f.clave === "gym") {
      setMeta("");
      setUnidad("");
    }
  }

  function alternarDia(d: number) {
    setDias((actual) => {
      // null = "todos los días". El primer toque lo convierte en una selección
      // explícita de los otros seis, que es lo que la persona quiere decir al
      // apagar un día.
      const base = actual ?? [0, 1, 2, 3, 4, 5, 6];
      const siguiente = base.includes(d) ? base.filter((x) => x !== d) : [...base, d].sort();
      // Los siete seleccionados vuelven a ser "todos los días" (null): así no
      // se guarda un arreglo completo que después estorbe si se agrega lógica.
      return siguiente.length === 7 ? null : siguiente;
    });
  }

  const diasActivos = dias ?? [0, 1, 2, 3, 4, 5, 6];
  const puedeGuardar = nombre.trim().length > 0 && diasActivos.length > 0 && !guardando;
  const metaNumero = meta.trim() === "" ? null : Number(meta.replace(",", "."));
  const aceptaMeta = fuente !== "gym";
  // Vista previa: se dibuja a la mitad para que se vea CÓMO se llena, no solo
  // cómo se ve vacío o lleno.
  const progresoPreview = metaNumero && metaNumero > 0 ? 0.5 : 1;

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      const datos = {
        nombre: nombre.trim(),
        emoji: null,
        categoria,
        dificultad,
        diasSemana: dias,
        metaSemanal: null,
        orden: habito?.orden ?? ordenSiguiente,
        visual,
        metaValor: aceptaMeta && metaNumero && metaNumero > 0 ? metaNumero : null,
        unidad: aceptaMeta ? (unidad.trim() || null) : null,
        fuente,
      };
      if (habito) await actualizarHabito(habito.id, datos);
      else await crearHabito(datos);
      onGuardado();
    } catch (err) {
      console.error("No se pudo guardar el hábito:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el hábito");
    } finally {
      setGuardando(false);
    }
  }

  async function archivar() {
    if (!habito) return;
    setGuardando(true);
    try {
      await archivarHabito(habito.id);
      toast.success(`"${habito.nombre}" archivado — su historial se conserva`);
      onGuardado();
    } catch (err) {
      console.error("No se pudo archivar el hábito:", err);
      toast.error("No se pudo archivar");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!habito) return;
    setGuardando(true);
    try {
      await borrarHabito(habito.id);
      toast.success(`"${habito.nombre}" y todo su historial fueron borrados`);
      onGuardado();
    } catch (err) {
      console.error("No se pudo borrar el hábito:", err);
      toast.error("No se pudo borrar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <SheetHeader
        title={habito ? "Editar hábito" : "Nuevo hábito"}
        onClose={onCerrar}
      />

      <div className="flex flex-col gap-5">
        {/* Vista previa grande: lo primero que se ve es CÓMO va a quedar. */}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-secondary/40 py-4">
          <span style={{ color: COLOR_NATURAL[visual] }}>
            <Medidor visual={visual} progreso={progresoPreview} estado="pendiente" tamano={76} />
          </span>
          <p className="text-[13px] font-semibold">{nombre.trim() || "Tu hábito"}</p>
        </div>

        <CampoCaja
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del hábito"
        />

        <div>
          <p className="mid-etiqueta mb-2">Cómo se ve</p>
          <div className="grid grid-cols-5 gap-1.5">
            {CATALOGO_MEDIDORES.map((m) => (
              <button
                key={m.clave}
                type="button"
                title={m.pista}
                aria-label={`${m.etiqueta}: ${m.pista}`}
                aria-pressed={visual === m.clave}
                onClick={() => setVisual(m.clave)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border py-2 transition-colors",
                  visual === m.clave ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                )}
              >
                <span style={{ color: COLOR_NATURAL[m.clave] }}>
                  <Medidor visual={m.clave} progreso={0.65} estado="pendiente" tamano={30} />
                </span>
                <span className="text-[9px] leading-none text-muted-foreground">{m.etiqueta}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mid-etiqueta mb-2">Cómo se llena</p>
          <div className="grid grid-cols-2 gap-1.5">
            {FUENTES.map((f) => (
              <button
                key={f.clave}
                type="button"
                onClick={() => elegirFuente(f)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  fuente === f.clave ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                )}
              >
                <span className="block text-[13px] font-medium">{f.etiqueta}</span>
                <span className="block text-[10.5px] leading-tight text-muted-foreground">{f.detalle}</span>
              </button>
            ))}
          </div>
        </div>

        {aceptaMeta && (
          <div>
            <p className="mid-etiqueta mb-2">Meta del día (opcional)</p>
            <div className="flex gap-2">
              <input
                value={meta}
                inputMode="decimal"
                onChange={(e) => setMeta(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="8"
                aria-label="Meta del día"
                className="mid-num h-11 w-20 rounded-lg border border-input bg-surface text-center text-[15px] font-semibold outline-none focus:border-primary/70"
              />
              <CampoCaja
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                placeholder="vasos, min, km, páginas…"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {metaNumero && metaNumero > 0
                ? "El medidor se llena poco a poco y se marca cumplido solo al llegar a la meta."
                : "Sin meta es un hábito de sí o no: un toque lo cumple."}
            </p>
          </div>
        )}

        <div>
          <p className="mid-etiqueta mb-2">Qué tan difícil es</p>
          <div className="flex gap-2">
            {DIFICULTADES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDificultad(d)}
                className={cn(
                  "flex-1 rounded-lg border py-2.5 text-[13px] font-medium transition-colors",
                  dificultad === d
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {ETIQUETA_DIFICULTAD[d]}
                <span className="mid-num block text-[11px] font-normal text-muted-foreground">
                  +{PUNTOS_POR_DIFICULTAD[d]} pts
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mid-etiqueta mb-2">Qué días toca</p>
          <div className="flex gap-1.5">
            {ORDEN_SEMANA.map((d) => {
              const activo = diasActivos.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => alternarDia(d)}
                  aria-pressed={activo}
                  aria-label={`Día ${DIAS_CORTOS[d]}`}
                  className={cn(
                    "h-10 flex-1 rounded-lg border text-[13px] font-semibold transition-colors",
                    activo
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground/60 hover:text-foreground"
                  )}
                >
                  {DIAS_CORTOS[d]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {dias === null
              ? "Todos los días."
              : "Los días apagados no cuentan como fallados ni rompen la racha."}
          </p>
        </div>

        <div>
          <p className="mid-etiqueta mb-2">Categoría</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS_HABITO.map((c) => (
              <button
                key={c.clave}
                type="button"
                onClick={() => setCategoria(categoria === c.clave ? null : c.clave)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  categoria === c.clave
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <span aria-hidden>{c.emoji}</span>
                {c.etiqueta}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          {habito ? "Guardar cambios" : "Crear hábito"}
        </Button>

        {habito && !confirmandoBorrado && (
          <div className="flex gap-2">
            <Button size="lg" variant="outline" className="flex-1" disabled={guardando} onClick={archivar}>
              <Archive className="h-4 w-4" /> Archivar
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="flex-1 text-destructive"
              disabled={guardando}
              onClick={() => setConfirmandoBorrado(true)}
            >
              <Trash2 className="h-4 w-4" /> Borrar
            </Button>
          </div>
        )}

        {habito && confirmandoBorrado && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-[13px] text-foreground">
              Borrar <strong>{habito.nombre}</strong> se lleva también todos sus registros pasados — el tracker de
              meses anteriores va a quedar con ese renglón vacío. Archivar lo saca de la pantalla Hoy y conserva
              el historial.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmandoBorrado(false)}>
                Mejor no
              </Button>
              <Button size="sm" variant="destructive" className="flex-1" disabled={guardando} onClick={eliminar}>
                Borrar todo
              </Button>
            </div>
          </div>
        )}
      </SheetFooter>
    </Sheet>
  );
}
