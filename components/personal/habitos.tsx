"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Archive, ChevronLeft, ChevronRight, Flame, Loader2, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  actualizarHabito, crearHabito, limpiarRegistro, marcarHabito, obtenerHabitos, obtenerRegistros,
  type HabitoNuevo,
} from "@/lib/personal/api";
import { aDate, diasDelMes, formatoMes, hoy, sumarDias, type ISODate } from "@/lib/personal/fechas";
import { aplicaEn, calcularRacha, estadoDe, resumirPeriodo } from "@/lib/personal/reglas";
import type { EstadoHabito, Habito, RegistroHabito } from "@/lib/personal/tipos";
import { EncabezadoPantalla } from "./shell";
import { EditorHabito } from "./habito-editor";
import { COLOR_ESTADO, ETIQUETA_ESTADO, EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";

/** Historial extra que se trae antes del mes visible, para que las rachas no empiecen de cero cada primero. */
const COLCHON_RACHA = 120;

export function PantallaHabitos() {
  const hoyISO = hoy();
  const [ancla, setAncla] = React.useState(() => ({ anio: aDate(hoyISO).getFullYear(), mes: aDate(hoyISO).getMonth() }));
  const [habitos, setHabitos] = React.useState<Habito[]>([]);
  const [archivados, setArchivados] = React.useState<Habito[]>([]);
  const [registros, setRegistros] = React.useState<RegistroHabito[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [editando, setEditando] = React.useState<Habito | null>(null);
  const [editorAbierto, setEditorAbierto] = React.useState(false);

  const dias = React.useMemo(() => diasDelMes(ancla.anio, ancla.mes), [ancla]);
  const primerDia = dias[0];
  const ultimoDia = dias[dias.length - 1];

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      const [todos, rs] = await Promise.all([
        obtenerHabitos(true),
        obtenerRegistros(sumarDias(primerDia, -COLCHON_RACHA), ultimoDia),
      ]);
      setHabitos(todos.filter((h) => h.activo));
      setArchivados(todos.filter((h) => !h.activo));
      setRegistros(rs);
    } catch (err) {
      console.error("No se pudieron cargar los hábitos:", err);
      toast.error(err instanceof Error ? err.message : "No se pudieron cargar los hábitos");
    } finally {
      setCargando(false);
    }
  }, [primerDia, ultimoDia]);

  React.useEffect(() => {
    void cargar();
  }, [cargar]);

  const porHabito = React.useMemo(() => {
    const mapa = new Map<string, Map<ISODate, RegistroHabito>>();
    for (const r of registros) {
      let porFecha = mapa.get(r.habitoId);
      if (!porFecha) {
        porFecha = new Map();
        mapa.set(r.habitoId, porFecha);
      }
      porFecha.set(r.fecha, r);
    }
    return mapa;
  }, [registros]);

  function moverMes(delta: number) {
    setAncla(({ anio, mes }) => {
      const d = new Date(anio, mes + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });
  }

  /**
   * Un toque en una celda cicla cumplido -> no cumplido -> sin marcar. Es la
   * forma de rellenar días que se te pasaron sin tener que entrar a cada uno.
   * El motivo (naranja) no se puede escribir desde aquí — para eso está el día
   * completo, a un toque del número de arriba.
   */
  async function ciclarCelda(habito: Habito, fecha: ISODate) {
    if (fecha > hoyISO) return; // el futuro no se marca
    if (!aplicaEn(habito, fecha)) return;
    const actual = porHabito.get(habito.id)?.get(fecha);
    const estado = estadoDe(habito, fecha, actual);
    try {
      if (estado === "pendiente") {
        const nuevo = await marcarHabito(habito, fecha, true);
        setRegistros((l) => [...l.filter((r) => !(r.habitoId === habito.id && r.fecha === fecha)), nuevo]);
      } else if (estado === "cumplido") {
        const nuevo = await marcarHabito(habito, fecha, false, null);
        setRegistros((l) => [...l.filter((r) => !(r.habitoId === habito.id && r.fecha === fecha)), nuevo]);
      } else {
        await limpiarRegistro(habito.id, fecha);
        setRegistros((l) => l.filter((r) => !(r.habitoId === habito.id && r.fecha === fecha)));
      }
    } catch (err) {
      console.error("No se pudo marcar el hábito:", err);
      toast.error("No se pudo guardar");
    }
  }

  async function desarchivar(h: Habito) {
    try {
      await actualizarHabito(h.id, { activo: true });
      void cargar();
    } catch (err) {
      console.error("No se pudo restaurar el hábito:", err);
      toast.error("No se pudo restaurar");
    }
  }

  function abrirEditor(h: Habito | null) {
    setEditando(h);
    setEditorAbierto(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPantalla
        titulo="Hábitos"
        descripcion="Verde cumplido · naranja con motivo · rojo sin motivo"
        accion={
          <Button size="sm" onClick={() => abrirEditor(null)}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        }
      />

      <Tarjeta>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => moverMes(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="mid-display text-[17px]">{formatoMes(ancla.anio, ancla.mes)}</h2>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => moverMes(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {cargando ? (
          <EstadoVacio>Cargando…</EstadoVacio>
        ) : habitos.length === 0 ? (
          <PaqueteInicial onListo={cargar} />
        ) : (
          <Tracker
            habitos={habitos}
            dias={dias}
            porHabito={porHabito}
            hoyISO={hoyISO}
            onCelda={ciclarCelda}
            onAbrirHabito={abrirEditor}
          />
        )}
      </Tarjeta>

      {archivados.length > 0 && (
        <Tarjeta>
          <TituloTarjeta icono={<Archive className="h-3.5 w-3.5" />}>Archivados</TituloTarjeta>
          <ul className="flex flex-col divide-y divide-border">
            {archivados.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[15px] text-muted-foreground">
                  {h.emoji} {h.nombre}
                </span>
                <button
                  type="button"
                  onClick={() => desarchivar(h)}
                  className="flex items-center gap-1 text-[12px] font-medium text-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                </button>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <EditorHabito
        abierto={editorAbierto}
        habito={editando}
        ordenSiguiente={habitos.length}
        onCerrar={() => setEditorAbierto(false)}
        onGuardado={() => {
          setEditorAbierto(false);
          void cargar();
        }}
      />
    </div>
  );
}

function Tracker({
  habitos,
  dias,
  porHabito,
  hoyISO,
  onCelda,
  onAbrirHabito,
}: {
  habitos: Habito[];
  dias: ISODate[];
  porHabito: Map<string, Map<ISODate, RegistroHabito>>;
  hoyISO: ISODate;
  onCelda: (h: Habito, f: ISODate) => void;
  onAbrirHabito: (h: Habito) => void;
}) {
  return (
    <div className="mid-sin-barra -mx-4 overflow-x-auto px-4">
      <div className="min-w-max">
        {/* Encabezado: números del mes. Cada uno abre ese día completo. */}
        <div className="mb-1.5 flex items-end gap-[3px] pl-[136px]">
          {dias.map((d) => {
            const n = aDate(d).getDate();
            const esHoy = d === hoyISO;
            return (
              <Link
                key={d}
                href={`/app/mi-dia?fecha=${d}`}
                title={`Abrir ${d}`}
                className={cn(
                  "mid-num flex h-5 w-[18px] items-center justify-center rounded text-[9px] font-semibold transition-colors",
                  esHoy ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {n}
              </Link>
            );
          })}
        </div>

        {habitos.map((habito) => {
          const registros = porHabito.get(habito.id) ?? new Map<ISODate, RegistroHabito>();
          const resumen = resumirPeriodo(habito, dias, registros);
          const racha = calcularRacha(habito, registros, {
            desde: sumarDias(dias[0], -COLCHON_RACHA),
            hasta: dias[dias.length - 1] > hoyISO ? hoyISO : dias[dias.length - 1],
          });

          return (
            <div key={habito.id} className="flex items-center gap-[3px] py-[3px]">
              <button
                type="button"
                onClick={() => onAbrirHabito(habito)}
                title="Editar hábito"
                className="sticky left-0 z-10 flex h-[26px] w-[136px] shrink-0 items-center gap-1.5 bg-card pr-2 text-left"
              >
                {habito.emoji && <span className="shrink-0 text-[13px] leading-none">{habito.emoji}</span>}
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{habito.nombre}</span>
                <span className="mid-num shrink-0 text-[10px] font-semibold text-muted-foreground">
                  {resumen.porcentaje}%
                </span>
                {racha.actual > 0 && (
                  <span className="mid-num flex shrink-0 items-center text-[10px] font-semibold text-[hsl(var(--mid-justificado))]">
                    <Flame className="h-2.5 w-2.5" />
                    {racha.actual}
                  </span>
                )}
              </button>

              {dias.map((d) => {
                const estado: EstadoHabito = estadoDe(habito, d, registros.get(d));
                const futuro = d > hoyISO;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={futuro || estado === "no-aplica"}
                    onClick={() => onCelda(habito, d)}
                    title={`${habito.nombre} · ${d} · ${ETIQUETA_ESTADO[estado]}`}
                    aria-label={`${habito.nombre} el ${d}: ${ETIQUETA_ESTADO[estado]}`}
                    className={cn(
                      "h-[22px] w-[18px] shrink-0 rounded-[4px] transition-transform",
                      estado === "no-aplica" && "border border-dashed border-border/60",
                      !futuro && estado !== "no-aplica" && "hover:scale-110 active:scale-95",
                      futuro && "opacity-35"
                    )}
                    style={{ background: estado === "no-aplica" ? "transparent" : COLOR_ESTADO[estado] }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Arranque en frío. Un tracker vacío con un botón "Nuevo" es la forma más
 * segura de que nunca se llene: hay que inventar de cero qué hábitos tener,
 * con qué dificultad y qué días. Esto propone cinco que casi todos quieren,
 * ya configurados (el gym en L-M-V, el agua fácil), y los crea de un toque.
 * Se editan o se borran después como cualquier otro.
 */
const PAQUETE: Omit<HabitoNuevo, "orden">[] = [
  { nombre: "Tomar agua", emoji: "💧", categoria: "bienestar", dificultad: "facil", diasSemana: null, metaSemanal: null },
  { nombre: "Gym", emoji: "🏋️", categoria: "cuerpo", dificultad: "dificil", diasSemana: [1, 3, 5], metaSemanal: 3 },
  { nombre: "Leer 20 min", emoji: "📚", categoria: "mente", dificultad: "media", diasSemana: null, metaSemanal: null },
  { nombre: "Dormir 7 horas", emoji: "🛏️", categoria: "bienestar", dificultad: "media", diasSemana: null, metaSemanal: null },
  { nombre: "Sin celular en la cama", emoji: "📵", categoria: "mente", dificultad: "media", diasSemana: null, metaSemanal: null },
];

function PaqueteInicial({ onListo }: { onListo: () => void }) {
  const [creando, setCreando] = React.useState(false);

  async function crearTodos() {
    setCreando(true);
    try {
      // En serie y no en paralelo: son cinco inserts y el orden importa (es el
      // que van a tener en la pantalla Hoy).
      for (let i = 0; i < PAQUETE.length; i++) {
        await crearHabito({ ...PAQUETE[i], orden: i });
      }
      toast.success("Listos. Edítalos o bórralos cuando quieras.");
      onListo();
    } catch (err) {
      console.error("No se pudo crear el paquete inicial:", err);
      toast.error(err instanceof Error ? err.message : "No se pudieron crear los hábitos");
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="py-4 text-center">
      <p className="text-sm text-muted-foreground">
        Todavía no tienes hábitos. Puedes crear el tuyo con el botón de arriba, o empezar con estos cinco:
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {PAQUETE.map((h) => (
          <span key={h.nombre} className="rounded-full border border-border px-3 py-1.5 text-[13px]">
            {h.emoji} {h.nombre}
          </span>
        ))}
      </div>
      <Button className="mt-4" disabled={creando} onClick={crearTodos}>
        {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Empezar con estos cinco"}
      </Button>
    </div>
  );
}
