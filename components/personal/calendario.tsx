"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { obtenerDias, obtenerHabitos, obtenerRegistros } from "@/lib/personal/api";
import { DIAS_CORTOS, MESES_LARGOS, aDate, diasDelMes, hoy, type ISODate } from "@/lib/personal/fechas";
import { aplicaEn, estadoDe } from "@/lib/personal/reglas";
import type { Dia, Habito, RegistroHabito } from "@/lib/personal/tipos";
import { EMOJI_ANIMO, EstadoVacio, Tarjeta } from "./piezas";
import { EncabezadoPantalla } from "./shell";

type Modo = "habitos" | "animo" | "registro";

const MODOS: { clave: Modo; etiqueta: string }[] = [
  { clave: "habitos", etiqueta: "Hábitos" },
  { clave: "animo", etiqueta: "Ánimo" },
  { clave: "registro", etiqueta: "Registro" },
];

/** Escala de ánimo 1-5: del rojo apagado al verde. Misma familia en los dos temas. */
const COLOR_ANIMO = [
  "hsl(6 62% 52%)",
  "hsl(24 72% 54%)",
  "hsl(45 78% 52%)",
  "hsl(128 42% 46%)",
  "hsl(158 55% 44%)",
];

/**
 * El año completo en una pantalla.
 *
 * Es la vista que da perspectiva: en la pantalla Hoy un mal día se siente
 * enorme, y aquí es un cuadrito entre trescientos sesenta y cuatro. Cada
 * cuadrito lleva a ese día completo.
 */
export function PantallaCalendario() {
  const hoyISO = hoy();
  const [anio, setAnio] = React.useState(() => aDate(hoyISO).getFullYear());
  const [modo, setModo] = React.useState<Modo>("habitos");
  const [dias, setDias] = React.useState<Dia[]>([]);
  const [habitos, setHabitos] = React.useState<Habito[]>([]);
  const [registros, setRegistros] = React.useState<RegistroHabito[]>([]);
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    let vivo = true;
    setCargando(true);
    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;
    Promise.all([obtenerDias(desde, hasta), obtenerHabitos(true), obtenerRegistros(desde, hasta)])
      .then(([ds, hs, rs]) => {
        if (!vivo) return;
        setDias(ds);
        setHabitos(hs);
        setRegistros(rs);
      })
      .catch((err) => {
        console.error("No se pudo cargar el año:", err);
        if (vivo) toast.error("No se pudo cargar el año");
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [anio]);

  const porFecha = React.useMemo(() => new Map(dias.map((d) => [d.fecha, d])), [dias]);

  const porcentajePorFecha = React.useMemo(() => {
    const porHabito = new Map<string, Map<ISODate, RegistroHabito>>();
    for (const r of registros) {
      let m = porHabito.get(r.habitoId);
      if (!m) {
        m = new Map();
        porHabito.set(r.habitoId, m);
      }
      m.set(r.fecha, r);
    }
    const mapa = new Map<ISODate, number>();
    // Solo se calcula para fechas que TIENEN algún registro: pintar de rojo
    // todo enero de un año en el que la app ni existía sería mentir.
    const fechasConAlgo = new Set(registros.map((r) => r.fecha));
    for (const fecha of fechasConAlgo) {
      let aplicables = 0;
      let cumplidos = 0;
      for (const h of habitos) {
        if (!aplicaEn(h, fecha)) continue;
        aplicables++;
        if (estadoDe(h, fecha, porHabito.get(h.id)?.get(fecha)) === "cumplido") cumplidos++;
      }
      mapa.set(fecha, aplicables === 0 ? 0 : Math.round((cumplidos / aplicables) * 100));
    }
    return mapa;
  }, [registros, habitos]);

  function colorDe(fecha: ISODate): string | null {
    if (modo === "animo") {
      const animo = porFecha.get(fecha)?.animo;
      return animo ? COLOR_ANIMO[animo - 1] : null;
    }
    if (modo === "registro") {
      const d = porFecha.get(fecha);
      if (!d) return null;
      return d.cerrado ? "hsl(var(--mid-cumplido))" : "hsl(var(--mid-justificado) / 0.55)";
    }
    const pct = porcentajePorFecha.get(fecha);
    if (pct == null) return null;
    // Verde con opacidad proporcional, con un piso visible para que 10% no se
    // confunda con "sin datos".
    return `hsl(var(--mid-cumplido) / ${(0.2 + (pct / 100) * 0.8).toFixed(2)})`;
  }

  const registrados = dias.length;
  const cerrados = dias.filter((d) => d.cerrado).length;
  const promedio = porcentajePorFecha.size === 0
    ? 0
    : Math.round([...porcentajePorFecha.values()].reduce((a, b) => a + b, 0) / porcentajePorFecha.size);

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPantalla titulo="El año" descripcion="Toca cualquier día para abrirlo completo" />

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Año anterior"
          onClick={() => setAnio((a) => a - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="mid-titulo text-[26px]">{anio}</h2>
        <button
          type="button"
          aria-label="Año siguiente"
          onClick={() => setAnio((a) => a + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1.5">
        {MODOS.map((m) => (
          <button
            key={m.clave}
            type="button"
            onClick={() => setModo(m.clave)}
            className={cn(
              "flex-1 rounded-full border py-1.5 text-[13px] transition-colors",
              modo === m.clave
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>

      <Tarjeta>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="mid-etiqueta">Días con algo</p>
            <p className="mid-num mid-display mt-0.5 text-[20px]">{registrados}</p>
          </div>
          <div>
            <p className="mid-etiqueta">Días cerrados</p>
            <p className="mid-num mid-display mt-0.5 text-[20px]">{cerrados}</p>
          </div>
          <div>
            <p className="mid-etiqueta">Hábitos promedio</p>
            <p className="mid-num mid-display mt-0.5 text-[20px]">{promedio}%</p>
          </div>
        </div>
      </Tarjeta>

      {cargando ? (
        <Tarjeta>
          <EstadoVacio>Cargando el año…</EstadoVacio>
        </Tarjeta>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }, (_, mes) => (
            <MiniMes key={mes} anio={anio} mes={mes} hoyISO={hoyISO} colorDe={colorDe} />
          ))}
        </div>
      )}

      <Tarjeta>
        <p className="mid-etiqueta mb-2">Cómo leerlo</p>
        {modo === "animo" ? (
          <div className="flex flex-wrap items-center gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="h-3.5 w-3.5 rounded-[3px]" style={{ background: COLOR_ANIMO[n - 1] }} />
                {EMOJI_ANIMO.get(n)}
              </span>
            ))}
          </div>
        ) : modo === "registro" ? (
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-[3px] bg-[hsl(var(--mid-cumplido))]" /> Día cerrado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-[3px] bg-[hsl(var(--mid-justificado)/0.55)]" /> Algo registrado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-[3px] border border-border" /> Sin nada
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>0%</span>
            {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
              <span
                key={o}
                className="h-3.5 w-6 rounded-[3px]"
                style={{ background: `hsl(var(--mid-cumplido) / ${o})` }}
              />
            ))}
            <span>100% de hábitos</span>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

function MiniMes({
  anio,
  mes,
  hoyISO,
  colorDe,
}: {
  anio: number;
  mes: number;
  hoyISO: ISODate;
  colorDe: (fecha: ISODate) => string | null;
}) {
  const dias = diasDelMes(anio, mes);
  // Huecos al inicio para que el 1 caiga en su columna. La semana empieza en
  // lunes, igual que la tira de Hoy y el editor de hábitos.
  const primerDow = aDate(dias[0]).getDay();
  const huecos = primerDow === 0 ? 6 : primerDow - 1;

  return (
    <Tarjeta className="p-3">
      <p className="mid-display mb-2 text-[14px] capitalize">{MESES_LARGOS[mes]}</p>
      <div className="grid grid-cols-7 gap-[3px]">
        {[1, 2, 3, 4, 5, 6, 0].map((d, i) => (
          <span key={i} className="mid-etiqueta text-center text-[8px] leading-4">
            {DIAS_CORTOS[d]}
          </span>
        ))}
        {Array.from({ length: huecos }, (_, i) => (
          <span key={`hueco-${i}`} />
        ))}
        {dias.map((fecha) => {
          const color = colorDe(fecha);
          const esHoy = fecha === hoyISO;
          const futuro = fecha > hoyISO;
          return (
            <Link
              key={fecha}
              href={`/app/mi-dia?fecha=${fecha}`}
              title={fecha}
              className={cn(
                "flex aspect-square items-center justify-center rounded-[3px] text-[9px] font-medium transition-transform hover:scale-125",
                !color && "border border-border/70 text-muted-foreground/50",
                color && "text-white",
                esHoy && "ring-1 ring-primary ring-offset-1 ring-offset-card",
                futuro && "opacity-40"
              )}
              style={color ? { background: color } : undefined}
            >
              {aDate(fecha).getDate()}
            </Link>
          );
        })}
      </div>
    </Tarjeta>
  );
}
