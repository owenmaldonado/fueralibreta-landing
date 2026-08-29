"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronRight, Dumbbell, Play, Repeat2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import { crearSesion, obtenerRutinas, obtenerSesiones } from "@/lib/personal/api";
import { formatoCorto, hoy, inicioSemana, sumarDias, type ISODate } from "@/lib/personal/fechas";
import { resumirSesion } from "@/lib/personal/gym";
import type { Rutina, Sesion } from "@/lib/personal/tipos";
import { CampoCaja } from "./campos";
import { EditorSesion } from "./gym-sesion";
import { PanelProgreso } from "./gym-progreso";
import { PanelRutinas } from "./gym-rutinas";
import { EstadoVacio, Tarjeta } from "./piezas";
import { EncabezadoPantalla } from "./shell";

/** Un año de historial: suficiente para progresiones reales sin traer toda la vida en cada carga. */
const DIAS_HISTORIAL = 365;

type Pestana = "sesiones" | "rutinas" | "progreso";

/** Lo que la URL pide al entrar (desde la tarjeta de gym de la pantalla Hoy). */
function intencionInicial(): { sesion: string | null; fecha: ISODate | null; nuevo: boolean } {
  if (typeof window === "undefined") return { sesion: null, fecha: null, nuevo: false };
  const p = new URLSearchParams(window.location.search);
  const fecha = p.get("fecha");
  return {
    sesion: p.get("sesion"),
    fecha: fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    nuevo: p.get("nuevo") === "1",
  };
}

export function PantallaGym() {
  const [sesiones, setSesiones] = React.useState<Sesion[]>([]);
  const [rutinas, setRutinas] = React.useState<Rutina[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [pestana, setPestana] = React.useState<Pestana>("sesiones");
  const [abiertaId, setAbiertaId] = React.useState<string | null>(null);
  const [eligiendo, setEligiendo] = React.useState(false);
  const [fechaNueva, setFechaNueva] = React.useState<ISODate>(() => hoy());

  const cargar = React.useCallback(async () => {
    try {
      const [ss, rs] = await Promise.all([
        obtenerSesiones(sumarDias(hoy(), -DIAS_HISTORIAL), hoy()),
        obtenerRutinas(),
      ]);
      setSesiones(ss);
      setRutinas(rs);
    } catch (err) {
      console.error("No se pudo cargar el gym:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo cargar el gym");
    } finally {
      setCargando(false);
    }
  }, []);

  React.useEffect(() => {
    void cargar();
  }, [cargar]);

  // La intención de la URL se aplica UNA vez, al montar. Si se aplicara en cada
  // render, cerrar la sesión abierta la volvería a abrir sola.
  React.useEffect(() => {
    const intencion = intencionInicial();
    if (intencion.fecha) setFechaNueva(intencion.fecha);
    if (intencion.sesion) setAbiertaId(intencion.sesion);
    else if (intencion.nuevo) setEligiendo(true);
  }, []);

  const abierta = sesiones.find((s) => s.id === abiertaId) ?? null;

  async function empezar(opciones: { nombre: string; rutina?: Rutina; copiarDe?: Sesion }) {
    try {
      const ejercicios = opciones.rutina
        ? opciones.rutina.ejercicios.map((e) => ({
            nombre: e.nombre,
            // Series vacías, listas para teclear. A propósito NO se precargan
            // los pesos de la vez pasada: quedarían guardados como si los
            // hubieras levantado aunque no aparecieras al gym. El número
            // anterior se ve como pista arriba de cada ejercicio, no como dato.
            series: Array.from({ length: e.seriesObjetivo }, (_, i) => ({
              numero: i + 1,
              pesoKg: null,
              repeticiones: null,
            })),
          }))
        : opciones.copiarDe
          ? opciones.copiarDe.ejercicios.map((e) => ({
              nombre: e.nombre,
              series: e.series.map((s, i) => ({ numero: i + 1, pesoKg: null, repeticiones: null })),
            }))
          : [];

      const id = await crearSesion({
        fecha: fechaNueva,
        nombre: opciones.nombre,
        rutinaId: opciones.rutina?.id ?? null,
        ejercicios,
      });
      setEligiendo(false);
      await cargar();
      setAbiertaId(id);
    } catch (err) {
      console.error("No se pudo crear la sesión:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo crear la sesión");
    }
  }

  if (abierta) {
    return (
      <EditorSesion
        sesion={abierta}
        historial={sesiones}
        onCambio={cargar}
        onCerrar={() => setAbiertaId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPantalla
        titulo="Gym"
        accion={
          <Button size="sm" onClick={() => { setFechaNueva(hoy()); setEligiendo(true); }}>
            <Play className="h-4 w-4" /> Entrenar
          </Button>
        }
      />

      <Resumen sesiones={sesiones} />

      <Tabs
        value={pestana}
        onValueChange={(v) => setPestana(v as Pestana)}
        tabs={[
          { value: "sesiones", label: "Sesiones" },
          { value: "rutinas", label: "Rutinas" },
          { value: "progreso", label: "Progreso" },
        ]}
      />

      {cargando ? (
        <Tarjeta>
          <EstadoVacio>Cargando…</EstadoVacio>
        </Tarjeta>
      ) : pestana === "sesiones" ? (
        <ListaSesiones sesiones={sesiones} onAbrir={setAbiertaId} onEntrenar={() => setEligiendo(true)} />
      ) : pestana === "rutinas" ? (
        <PanelRutinas rutinas={rutinas} onCambio={cargar} />
      ) : (
        <PanelProgreso sesiones={sesiones} />
      )}

      <HojaEmpezar
        abierta={eligiendo}
        rutinas={rutinas}
        ultimas={sesiones.slice(0, 3)}
        fecha={fechaNueva}
        onFecha={setFechaNueva}
        onCerrar={() => setEligiendo(false)}
        onEmpezar={empezar}
      />
    </div>
  );
}

function Resumen({ sesiones }: { sesiones: Sesion[] }) {
  const lunes = inicioSemana(hoy());
  const hace30 = sumarDias(hoy(), -29);

  const estaSemana = sesiones.filter((s) => s.fecha >= lunes).length;
  const mes = sesiones.filter((s) => s.fecha >= hace30);
  const volumenMes = mes.reduce((acc, s) => acc + resumirSesion(s).volumen, 0);

  return (
    <Tarjeta>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="mid-etiqueta">Esta semana</p>
          <p className="mid-num mid-display mt-0.5 text-[22px]">{estaSemana}</p>
        </div>
        <div>
          <p className="mid-etiqueta">Últimos 30 días</p>
          <p className="mid-num mid-display mt-0.5 text-[22px]">{mes.length}</p>
        </div>
        <div>
          <p className="mid-etiqueta">Kg movidos (30 d)</p>
          <p className="mid-num mid-display mt-0.5 text-[22px]">
            {volumenMes > 0 ? Math.round(volumenMes).toLocaleString("es-MX") : "—"}
          </p>
        </div>
      </div>
    </Tarjeta>
  );
}

function ListaSesiones({
  sesiones,
  onAbrir,
  onEntrenar,
}: {
  sesiones: Sesion[];
  onAbrir: (id: string) => void;
  onEntrenar: () => void;
}) {
  if (sesiones.length === 0) {
    return (
      <Tarjeta>
        <EstadoVacio className="py-8">
          Sin sesiones todavía.
          <br />
          <button type="button" onClick={onEntrenar} className="mt-2 font-medium text-primary underline underline-offset-4">
            Registra la primera
          </button>
        </EstadoVacio>
      </Tarjeta>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sesiones.map((s) => {
        const r = resumirSesion(s);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onAbrir(s.id)}
            className="mid-tarjeta flex items-center gap-3 p-3.5 text-left transition-colors hover:border-primary/40"
          >
            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-secondary">
              <span className="mid-num text-[15px] font-bold leading-none">{Number(s.fecha.slice(8, 10))}</span>
              <span className="mid-etiqueta mt-0.5 text-[8px]">{formatoCorto(s.fecha).split(" ")[1]}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="mid-display truncate text-[16px]">{s.nombre}</p>
              <p className="mid-num mt-0.5 text-[12px] text-muted-foreground">
                {r.ejercicios} ejercicios · {r.series} series
                {r.volumen > 0 && <> · {Math.round(r.volumen).toLocaleString("es-MX")} kg</>}
                {s.duracionMin ? ` · ${s.duracionMin} min` : ""}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}

function HojaEmpezar({
  abierta,
  rutinas,
  ultimas,
  fecha,
  onFecha,
  onCerrar,
  onEmpezar,
}: {
  abierta: boolean;
  rutinas: Rutina[];
  ultimas: Sesion[];
  fecha: ISODate;
  onFecha: (f: ISODate) => void;
  onCerrar: () => void;
  onEmpezar: (o: { nombre: string; rutina?: Rutina; copiarDe?: Sesion }) => void;
}) {
  const [libre, setLibre] = React.useState("");

  React.useEffect(() => {
    if (abierta) setLibre("");
  }, [abierta]);

  return (
    <Sheet open={abierta} onOpenChange={(o) => !o && onCerrar()}>
      <SheetHeader title="Empezar sesión" onClose={onCerrar} />

      <div className="flex flex-col gap-4">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-input bg-surface px-3 py-2">
          <span className="mid-etiqueta">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => e.target.value && onFecha(e.target.value)}
            className="mid-num bg-transparent text-[15px] outline-none"
          />
        </label>

        {rutinas.length > 0 && (
          <div>
            <p className="mid-etiqueta mb-2">Desde una rutina</p>
            <div className="flex flex-col gap-2">
              {rutinas.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onEmpezar({ nombre: r.nombre, rutina: r })}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/60 hover:bg-secondary/50"
                >
                  <Dumbbell className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.nombre}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {r.ejercicios.length === 0
                        ? "Sin ejercicios"
                        : r.ejercicios.map((e) => e.nombre).join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {ultimas.length > 0 && (
          <div>
            <p className="mid-etiqueta mb-2">Repetir una reciente</p>
            <div className="flex flex-col gap-2">
              {ultimas.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onEmpezar({ nombre: s.nombre, copiarDe: s })}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/60 hover:bg-secondary/50"
                >
                  <Repeat2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{s.nombre}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {formatoCorto(s.fecha)} · {s.ejercicios.length} ejercicios
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mid-etiqueta mb-2">O una sesión libre</p>
          <div className="flex gap-2">
            <CampoCaja
              value={libre}
              onChange={(e) => setLibre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && libre.trim() && onEmpezar({ nombre: libre.trim() })}
              placeholder="Ej. Espalda y bíceps"
            />
            <Button disabled={!libre.trim()} onClick={() => onEmpezar({ nombre: libre.trim() })}>
              Empezar
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
