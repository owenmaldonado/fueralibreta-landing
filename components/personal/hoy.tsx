"use client";

import * as React from "react";
import { toast } from "sonner";
import { BookOpen, CalendarCheck2, Check, Moon, Quote, Scale, Sparkles, Utensils } from "lucide-react";

import { cn } from "@/lib/utils";
import { limpiarRegistro, marcarHabito, obtenerHabitos, obtenerRegistros } from "@/lib/personal/api";
import { etiquetaRelativa, formatoLargo, hoy, inicioSemana, semanaDe, sumarDias, type ISODate } from "@/lib/personal/fechas";
import { aplicaEn, calcularRacha, derivarAutomatico, estadoDe, resumirPeriodo } from "@/lib/personal/reglas";
import type { Habito, RegistroHabito } from "@/lib/personal/tipos";
import { useDia } from "@/lib/personal/use-dia";
import { AreaTexto, ContadorAgua, Stepper } from "./campos";
import { BloqueAgenda } from "./hoy-agenda";
import { BloqueDinero } from "./hoy-dinero";
import { BloqueGym } from "./hoy-gym";
import { BloqueHabitos } from "./hoy-habitos";
import { AnilloProgreso, EscalaAnimo, EscalaBarras, IndicadorGuardado, SelectorClima, Tarjeta, TituloTarjeta } from "./piezas";
import { TiraSemana } from "./tira-semana";

/** Cuánto historial se trae para poder calcular rachas de verdad (no solo de esta semana). */
const DIAS_DE_HISTORIAL = 180;

/**
 * `?fecha=YYYY-MM-DD` abre el día que sea (lo usan el tracker de hábitos y el
 * calendario anual para llevarte a un día pasado). Se lee de
 * window.location a mano y no con useSearchParams() por el mismo motivo que en
 * app/app/configuracion/page.tsx: useSearchParams() obliga a envolver la
 * pantalla en un <Suspense>, y aquí no hay nada que suspender.
 */
function fechaInicial(): ISODate {
  if (typeof window === "undefined") return hoy();
  const pedida = new URLSearchParams(window.location.search).get("fecha");
  return pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoy();
}

export function PantallaHoy() {
  const [fecha, setFecha] = React.useState<ISODate>(fechaInicial);
  const { dia, cargando, estado, actualizar } = useDia(fecha);

  const [habitos, setHabitos] = React.useState<Habito[]>([]);
  const [registros, setRegistros] = React.useState<RegistroHabito[]>([]);
  // null = todavía no sabemos (BloqueGym no ha respondido). Distinto de 0, que
  // sí significa "no entrenó": sin esa distinción, el hábito de gym se
  // desmarcaría solo cada vez que cambias de día, antes de que cargue la data.
  const [sesionesDelDia, setSesionesDelDia] = React.useState<number | null>(null);

  // El historial se recarga por SEMANA, no por día: moverte entre los 7 días
  // de la tira no vuelve a pegarle a la red.
  const lunes = inicioSemana(fecha);

  const recargarHabitos = React.useCallback(async () => {
    try {
      const [hs, rs] = await Promise.all([
        obtenerHabitos(),
        obtenerRegistros(sumarDias(lunes, -DIAS_DE_HISTORIAL), sumarDias(lunes, 6)),
      ]);
      setHabitos(hs);
      setRegistros(rs);
    } catch (err) {
      console.error("No se pudieron cargar los hábitos:", err);
      toast.error(err instanceof Error ? err.message : "No se pudieron cargar los hábitos");
    }
  }, [lunes]);

  React.useEffect(() => {
    void recargarHabitos();
  }, [recargarHabitos]);

  React.useEffect(() => {
    setSesionesDelDia(null);
  }, [fecha]);

  // ---- Índices derivados ---------------------------------------------------

  /** habitoId -> (fecha -> registro). Se calcula una vez por carga, no por fila. */
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

  const registrosDelDia = React.useMemo(() => {
    const mapa = new Map<string, RegistroHabito>();
    for (const [habitoId, porFecha] of porHabito) {
      const r = porFecha.get(fecha);
      if (r) mapa.set(habitoId, r);
    }
    return mapa;
  }, [porHabito, fecha]);

  const rachas = React.useMemo(() => {
    const mapa = new Map<string, number>();
    const desde = sumarDias(lunes, -DIAS_DE_HISTORIAL);
    for (const h of habitos) {
      mapa.set(h.id, calcularRacha(h, porHabito.get(h.id) ?? new Map(), { desde, hasta: fecha }).actual);
    }
    return mapa;
  }, [habitos, porHabito, lunes, fecha]);

  /** Progreso de cada día de la semana visible, para los anillitos de la tira. */
  const progresoSemana = React.useMemo(() => {
    const mapa = new Map<ISODate, number>();
    for (const d of semanaDe(fecha)) {
      let aplicables = 0;
      let cumplidos = 0;
      for (const h of habitos) {
        if (!aplicaEn(h, d)) continue;
        aplicables++;
        if (estadoDe(h, d, porHabito.get(h.id)?.get(d)) === "cumplido") cumplidos++;
      }
      mapa.set(d, aplicables === 0 ? 0 : Math.round((cumplidos / aplicables) * 100));
    }
    return mapa;
  }, [habitos, porHabito, fecha]);

  const resumenHoy = React.useMemo(() => {
    const total = { aplicables: 0, cumplidos: 0, puntos: 0 };
    for (const h of habitos) {
      const r = resumirPeriodo(h, [fecha], porHabito.get(h.id) ?? new Map());
      total.aplicables += r.aplicables;
      total.cumplidos += r.cumplidos;
      total.puntos += r.puntos;
    }
    return total;
  }, [habitos, porHabito, fecha]);

  const porcentaje = resumenHoy.aplicables === 0 ? 0 : Math.round((resumenHoy.cumplidos / resumenHoy.aplicables) * 100);

  // La fecha en pantalla, leída dentro del callback: al "limpiar" un hábito no
  // llega ningún registro del cual sacarla, y meter `fecha` en las dependencias
  // recrearía el callback (y con él, todas las filas) en cada cambio de día.
  const fechaRef = React.useRef(fecha);
  fechaRef.current = fecha;

  // Un cambio en un hábito actualiza la lista en memoria en lugar de recargar
  // 180 días desde la red: el anillo, la racha y la tira reaccionan al instante.
  const alCambiarHabito = React.useCallback((registro: RegistroHabito | null, habitoId: string) => {
    const delDia = fechaRef.current;
    setRegistros((lista) => {
      const sinEse = lista.filter((r) => !(r.habitoId === habitoId && r.fecha === delDia));
      return registro ? [...sinEse, registro] : sinEse;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Hábitos automáticos: se llenan solos con lo que ya capturaste en el día.
  //
  // Sin esto, "tomar 8 vasos" habría que registrarlo dos veces (en la tarjeta
  // del día y en el hábito), y un dato que se pide dos veces es un dato que se
  // deja de capturar. Aquí se compara lo que el día DICE contra lo que el
  // registro del hábito GUARDA, y solo se escribe cuando difieren — así el
  // efecto converge en una pasada y no se cicla.
  // -------------------------------------------------------------------------
  const reconciliando = React.useRef(false);

  React.useEffect(() => {
    if (cargando || reconciliando.current) return;

    const tareas: (() => Promise<void>)[] = [];

    for (const habito of habitos) {
      if (habito.fuente === "manual" || !aplicaEn(habito, fecha)) continue;
      const debeSer = derivarAutomatico(habito, {
        vasosAgua: dia.vasosAgua,
        horasSueno: dia.horasSueno,
        sesionesGym: sesionesDelDia,
      });
      if (!debeSer) continue;

      const guardado = registrosDelDia.get(habito.id);
      const vacio = !debeSer.cumplido && (debeSer.avance ?? 0) === 0;

      if (vacio) {
        if (guardado) {
          tareas.push(async () => {
            await limpiarRegistro(habito.id, fecha);
            alCambiarHabito(null, habito.id);
          });
        }
        continue;
      }

      const igual =
        guardado &&
        guardado.cumplido === debeSer.cumplido &&
        (guardado.avance ?? 0) === (debeSer.avance ?? 0);
      if (igual) continue;

      tareas.push(async () => {
        const nuevo = await marcarHabito(habito, fecha, debeSer.cumplido, null, debeSer.avance);
        alCambiarHabito(nuevo, habito.id);
      });
    }

    if (tareas.length === 0) return;

    reconciliando.current = true;
    (async () => {
      try {
        for (const tarea of tareas) await tarea();
      } catch (err) {
        // Un fallo aquí no debe tirar la pantalla: el hábito automático se
        // queda como estaba y se vuelve a intentar al siguiente cambio.
        console.error("No se pudo sincronizar un hábito automático:", err);
      } finally {
        reconciliando.current = false;
      }
    })();
  }, [cargando, dia.vasosAgua, dia.horasSueno, sesionesDelDia, habitos, registrosDelDia, fecha, alCambiarHabito]);

  const esHoy = fecha === hoy();

  return (
    <div className="flex flex-col gap-3">
      {/* ---------------- Encabezado del día ---------------- */}
      <header className="mb-1">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mid-etiqueta">{etiquetaRelativa(fecha)}</p>
            <h1 className="mid-titulo mt-1 text-[30px] leading-[1.05]">
              {capitalizar(formatoLargo(fecha))}
            </h1>
            <div className="mt-2 flex h-4 items-center gap-3">
              <IndicadorGuardado estado={estado} />
              {!esHoy && (
                <button
                  type="button"
                  onClick={() => setFecha(hoy())}
                  className="text-[11px] font-medium text-primary underline underline-offset-4"
                >
                  Ir a hoy
                </button>
              )}
            </div>
          </div>

          <AnilloProgreso porcentaje={porcentaje} color="hsl(var(--mid-cumplido))">
            <span className="mid-num mid-display text-[19px] leading-none">{porcentaje}%</span>
            <span className="mid-num mt-0.5 text-[10px] text-muted-foreground">
              {resumenHoy.cumplidos}/{resumenHoy.aplicables}
            </span>
          </AnilloProgreso>
        </div>

        <div className="mt-3">
          <TiraSemana fecha={fecha} onSeleccionar={setFecha} progresoPorDia={progresoSemana} />
        </div>
      </header>

      {/* ---------------- Cómo amaneciste ---------------- */}
      <Tarjeta>
        <TituloTarjeta accion={<SelectorClima valor={dia.clima} onChange={(c) => actualizar({ clima: c }, true)} />}>
          Cómo vas
        </TituloTarjeta>

        <div className="mb-4">
          <p className="mid-etiqueta mb-1.5">Ánimo</p>
          <EscalaAnimo valor={dia.animo} onChange={(v) => actualizar({ animo: v }, true)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mid-etiqueta mb-2">Energía</p>
            <EscalaBarras valor={dia.energia} onChange={(v) => actualizar({ energia: v }, true)} />
          </div>
          <div id="mid-sueno" className="scroll-mt-20">
            <p className="mid-etiqueta mb-1 flex items-center gap-1">
              <Moon className="h-3 w-3" /> Sueño
            </p>
            <Stepper
              valor={dia.horasSueno}
              onChange={(v) => actualizar({ horasSueno: v }, true)}
              paso={0.5}
              max={16}
              sufijo="h"
            />
          </div>
        </div>

        <div id="mid-agua" className="mt-4 scroll-mt-20 border-t border-border pt-3">
          <p className="mid-etiqueta mb-2">Agua</p>
          <ContadorAgua valor={dia.vasosAgua} onChange={(v) => actualizar({ vasosAgua: v }, true)} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="mid-etiqueta flex items-center gap-1">
            <Scale className="h-3 w-3" /> Peso
          </p>
          <Stepper
            valor={dia.pesoKg}
            onChange={(v) => actualizar({ pesoKg: v }, true)}
            paso={0.1}
            max={300}
            sufijo=" kg"
          />
        </div>
      </Tarjeta>

      {/* ---------------- Hábitos ---------------- */}
      <BloqueHabitos
        fecha={fecha}
        habitos={habitos}
        registros={registrosDelDia}
        rachas={rachas}
        onCambio={alCambiarHabito}
      />

      {/* ---------------- Agenda / Gym / Dinero ---------------- */}
      <BloqueAgenda key={`agenda-${fecha}`} fecha={fecha} />
      <BloqueGym key={`gym-${fecha}`} fecha={fecha} onSesiones={setSesionesDelDia} />
      <BloqueDinero key={`dinero-${fecha}`} fecha={fecha} />

      {/* ---------------- Comidas ---------------- */}
      <Tarjeta>
        <TituloTarjeta icono={<Utensils className="h-3.5 w-3.5" />}>Comidas</TituloTarjeta>
        <div className="flex flex-col divide-y divide-border">
          <Comida etiqueta="Desayuno" valor={dia.desayuno} onChange={(v) => actualizar({ desayuno: v })} />
          <Comida etiqueta="Comida" valor={dia.comida} onChange={(v) => actualizar({ comida: v })} />
          <Comida etiqueta="Cena" valor={dia.cena} onChange={(v) => actualizar({ cena: v })} />
          <Comida etiqueta="Snacks" valor={dia.snacks} onChange={(v) => actualizar({ snacks: v })} />
        </div>
      </Tarjeta>

      {/* ---------------- Cierre del día ---------------- */}
      <Tarjeta className="mid-renglones">
        <TituloTarjeta icono={<BookOpen className="h-3.5 w-3.5" />}>El día en tus palabras</TituloTarjeta>

        <div className="flex flex-col gap-4">
          <BloqueEscritura
            icono={<Sparkles className="h-3.5 w-3.5" />}
            etiqueta="Foco del día"
            placeholder="Si solo sale una cosa hoy, ¿cuál?"
            valor={dia.focoDelDia}
            onChange={(v) => actualizar({ focoDelDia: v })}
          />
          <BloqueEscritura
            icono={<Quote className="h-3.5 w-3.5" />}
            etiqueta="Gratitud"
            placeholder="Algo que agradeces de hoy…"
            valor={dia.gratitud}
            onChange={(v) => actualizar({ gratitud: v })}
          />
          <BloqueEscritura
            icono={<CalendarCheck2 className="h-3.5 w-3.5" />}
            etiqueta="Lo que hay que recordar"
            placeholder="Lo que no quieres que se te olvide de este día…"
            valor={dia.notaDestacada}
            onChange={(v) => actualizar({ notaDestacada: v })}
            serif
          />
        </div>
      </Tarjeta>

      <BotonCerrarDia
        cerrado={dia.cerrado}
        cargando={cargando}
        puntos={resumenHoy.puntos}
        porcentaje={porcentaje}
        onCerrar={(valor) => {
          actualizar({ cerrado: valor }, true);
          if (valor) {
            toast.success(
              resumenHoy.aplicables > 0
                ? `Día cerrado — ${resumenHoy.cumplidos} de ${resumenHoy.aplicables} hábitos, +${resumenHoy.puntos} pts`
                : "Día cerrado"
            );
          }
        }}
      />
    </div>
  );
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Comida({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
      <span className="mid-etiqueta w-[68px] shrink-0">{etiqueta}</span>
      <AreaTexto valor={valor ?? ""} onChange={onChange} placeholder="—" className="text-[14px]" />
    </div>
  );
}

function BloqueEscritura({
  icono,
  etiqueta,
  placeholder,
  valor,
  onChange,
  serif,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  placeholder: string;
  valor: string | null;
  onChange: (v: string) => void;
  serif?: boolean;
}) {
  return (
    <div>
      <p className="mid-etiqueta mb-1 flex items-center gap-1.5">
        {icono}
        {etiqueta}
      </p>
      <AreaTexto valor={valor ?? ""} onChange={onChange} placeholder={placeholder} serif={serif} />
    </div>
  );
}

function BotonCerrarDia({
  cerrado,
  cargando,
  puntos,
  porcentaje,
  onCerrar,
}: {
  cerrado: boolean;
  cargando: boolean;
  puntos: number;
  porcentaje: number;
  onCerrar: (valor: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={cargando}
      onClick={() => onCerrar(!cerrado)}
      className={cn(
        "flex w-full items-center justify-center gap-2.5 rounded-xl border py-4 text-[15px] font-semibold transition-all active:scale-[0.99] disabled:opacity-50",
        cerrado
          ? "border-transparent bg-[hsl(var(--mid-cumplido))]/15 text-[hsl(var(--mid-cumplido))]"
          : "border-border text-foreground hover:border-primary/60 hover:bg-secondary"
      )}
    >
      {cerrado ? (
        <>
          <Check className="h-5 w-5" strokeWidth={2.5} />
          Día cerrado · {porcentaje}% · +{puntos} pts
        </>
      ) : (
        <>Cerrar el día</>
      )}
    </button>
  );
}
