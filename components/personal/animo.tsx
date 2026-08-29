"use client";

import * as React from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { obtenerDias, obtenerHabitos, obtenerRegistros, obtenerSesiones } from "@/lib/personal/api";
import {
  MINIMO_POR_LADO, animoPorDiaSemana, armarSerie, comparaciones, distribucionAnimo, type Comparacion,
} from "@/lib/personal/correlaciones";
import { DIAS_CORTOS, formatoCorto, hoy, sumarDias, type ISODate } from "@/lib/personal/fechas";
import { aplicaEn, estadoDe } from "@/lib/personal/reglas";
import type { Dia, Habito, RegistroHabito, Sesion } from "@/lib/personal/tipos";
import { useColoresGrafica } from "./grafica";
import { EMOJI_ANIMO, ETIQUETA_ANIMO, EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";
import { EncabezadoPantalla } from "./shell";

const RANGOS = [
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "3 meses" },
  { dias: 180, etiqueta: "6 meses" },
];

export function PantallaAnimo() {
  const colores = useColoresGrafica();
  const [rango, setRango] = React.useState(90);
  const [dias, setDias] = React.useState<Dia[]>([]);
  const [habitos, setHabitos] = React.useState<Habito[]>([]);
  const [registros, setRegistros] = React.useState<RegistroHabito[]>([]);
  const [sesiones, setSesiones] = React.useState<Sesion[]>([]);
  const [cargando, setCargando] = React.useState(true);

  const desde = React.useMemo(() => sumarDias(hoy(), -(rango - 1)), [rango]);

  React.useEffect(() => {
    let vivo = true;
    setCargando(true);
    const hasta = hoy();
    Promise.all([
      obtenerDias(desde, hasta),
      obtenerHabitos(true),
      obtenerRegistros(desde, hasta),
      obtenerSesiones(desde, hasta),
    ])
      .then(([ds, hs, rs, ss]) => {
        if (!vivo) return;
        setDias(ds);
        setHabitos(hs);
        setRegistros(rs);
        setSesiones(ss);
      })
      .catch((err) => {
        console.error("No se pudo cargar el ánimo:", err);
        if (vivo) toast.error("No se pudieron cargar los datos");
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [desde]);

  /** fecha -> % de hábitos cumplidos, contando solo los que aplicaban ese día. */
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
    for (const d of dias) {
      let aplicables = 0;
      let cumplidos = 0;
      for (const h of habitos) {
        if (!aplicaEn(h, d.fecha)) continue;
        aplicables++;
        if (estadoDe(h, d.fecha, porHabito.get(h.id)?.get(d.fecha)) === "cumplido") cumplidos++;
      }
      mapa.set(d.fecha, aplicables === 0 ? 0 : Math.round((cumplidos / aplicables) * 100));
    }
    return mapa;
  }, [dias, habitos, registros]);

  const fechasConGym = React.useMemo(() => new Set(sesiones.map((s) => s.fecha)), [sesiones]);
  const serie = React.useMemo(
    () => armarSerie(dias, porcentajePorFecha, fechasConGym),
    [dias, porcentajePorFecha, fechasConGym]
  );

  const datosGrafica = React.useMemo(
    () => serie.map((e) => ({ etiqueta: formatoCorto(e.fecha), animo: e.animo, habitos: e.porcentajeHabitos })),
    [serie]
  );

  const comparativas = React.useMemo(() => comparaciones(serie), [serie]);
  const porDiaSemana = React.useMemo(() => animoPorDiaSemana(serie), [serie]);
  const distribucion = React.useMemo(() => distribucionAnimo(serie), [serie]);
  const promedio = serie.length === 0 ? 0 : serie.reduce((a, e) => a + e.animo, 0) / serie.length;

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPantalla titulo="Ánimo" descripcion="Cómo te has sentido, y con qué se junta" />

      <div className="flex gap-1.5">
        {RANGOS.map((r) => (
          <button
            key={r.dias}
            type="button"
            onClick={() => setRango(r.dias)}
            className={cn(
              "flex-1 rounded-full border py-1.5 text-[13px] transition-colors",
              rango === r.dias
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {r.etiqueta}
          </button>
        ))}
      </div>

      {cargando ? (
        <Tarjeta>
          <EstadoVacio>Cargando…</EstadoVacio>
        </Tarjeta>
      ) : serie.length === 0 ? (
        <Tarjeta>
          <EstadoVacio className="py-8">
            Todavía no has registrado tu ánimo. Se marca en un toque desde la pantalla Hoy — con dos semanas ya
            empiezan a salir cosas interesantes aquí.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <>
          <Tarjeta>
            <TituloTarjeta
              accion={
                <span className="mid-num text-[13px] font-semibold">
                  {EMOJI_ANIMO.get(Math.round(promedio))} {Math.round(promedio * 10) / 10} de 5
                </span>
              }
            >
              Tu ánimo en el tiempo
            </TituloTarjeta>

            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={datosGrafica} margin={{ top: 6, right: 6, left: -26, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={colores.reja} />
                <XAxis
                  dataKey="etiqueta"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colores.eje, fontSize: 10 }}
                  interval={Math.max(0, Math.ceil(datosGrafica.length / 7) - 1)}
                />
                <YAxis
                  yAxisId="animo"
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colores.eje, fontSize: 10 }}
                  width={46}
                />
                <YAxis yAxisId="habitos" domain={[0, 100]} hide />
                <Tooltip
                  contentStyle={colores.tooltip}
                  formatter={(valor, nombre) =>
                    nombre === "habitos"
                      ? [`${valor ?? 0}%`, "Hábitos cumplidos"]
                      : [`${ETIQUETA_ANIMO.get(Number(valor)) ?? valor}`, "Ánimo"]
                  }
                />
                {/* El área de hábitos va DETRÁS y sin eje visible: no se lee como
                    un segundo número que hay que interpretar, se lee como el
                    fondo contra el cual sube o baja el ánimo. */}
                <Area
                  yAxisId="habitos"
                  type="monotone"
                  dataKey="habitos"
                  stroke="none"
                  fill={colores.verde}
                  fillOpacity={0.14}
                />
                <Line
                  yAxisId="animo"
                  type="monotone"
                  dataKey="animo"
                  stroke={colores.primario}
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: colores.primario }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              El sombreado verde es el % de hábitos cumplidos ese día.
            </p>
          </Tarjeta>

          <Tarjeta>
            <TituloTarjeta>Qué se junta con sentirte bien</TituloTarjeta>
            <div className="flex flex-col gap-2.5">
              {comparativas.map((c) => (
                <FilaComparacion key={c.clave} c={c} />
              ))}
            </div>
            <p className="mt-3 border-t border-border pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              Esto no dice que una cosa cause la otra — dice que van juntas en tus datos. Con más días registrados,
              más confiable.
            </p>
          </Tarjeta>

          <Tarjeta>
            <TituloTarjeta>Por día de la semana</TituloTarjeta>
            <div className="flex items-end justify-between gap-1.5 pt-2">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const valor = porDiaSemana[d];
                const alto = valor == null ? 4 : 8 + ((valor - 1) / 4) * 72;
                return (
                  <div key={d} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="mid-num text-[10px] font-semibold text-muted-foreground">
                      {valor == null ? "—" : valor}
                    </span>
                    <span
                      className="w-full rounded-t-[4px] transition-all"
                      style={{
                        height: alto,
                        background: valor == null ? "hsl(var(--mid-pendiente))" : colores.primario,
                        opacity: valor == null ? 0.5 : 0.55 + ((valor - 1) / 4) * 0.45,
                      }}
                    />
                    <span className="mid-etiqueta text-[9px]">{DIAS_CORTOS[d]}</span>
                  </div>
                );
              })}
            </div>
          </Tarjeta>

          <Tarjeta>
            <TituloTarjeta accion={<span className="text-[11px] text-muted-foreground">{serie.length} días</span>}>
              Cómo se reparten tus días
            </TituloTarjeta>
            <div className="flex flex-col gap-2">
              {[5, 4, 3, 2, 1].map((n) => {
                const veces = distribucion[n - 1];
                const pct = serie.length === 0 ? 0 : Math.round((veces / serie.length) * 100);
                return (
                  <div key={n} className="flex items-center gap-2.5">
                    <span className="w-6 shrink-0 text-center text-lg">{EMOJI_ANIMO.get(n)}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--mid-pendiente))]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: colores.primario }}
                      />
                    </div>
                    <span className="mid-num w-16 shrink-0 text-right text-[12px] text-muted-foreground">
                      {veces} {veces === 1 ? "día" : "días"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Tarjeta>
        </>
      )}
    </div>
  );
}

function FilaComparacion({ c }: { c: Comparacion }) {
  if (!c.suficiente) {
    const faltanCon = Math.max(0, MINIMO_POR_LADO - c.diasCon);
    const faltanSin = Math.max(0, MINIMO_POR_LADO - c.diasSin);
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2.5">
        <p className="text-[14px] font-medium">{c.titulo}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Faltan datos para comparar
          {faltanCon > 0 && ` (${faltanCon} ${faltanCon === 1 ? "día más" : "días más"} ${c.etiquetaCon})`}
          {faltanSin > 0 && ` (${faltanSin} ${faltanSin === 1 ? "día más" : "días más"} ${c.etiquetaSin})`}
          .
        </p>
      </div>
    );
  }

  const sube = c.delta > 0.15;
  const baja = c.delta < -0.15;
  const Icono = sube ? ArrowUp : baja ? ArrowDown : Minus;

  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-medium">{c.titulo}</p>
        <span
          className={cn(
            "mid-num flex items-center gap-0.5 text-[13px] font-bold",
            sube ? "text-[hsl(var(--mid-cumplido))]" : baja ? "text-destructive" : "text-muted-foreground"
          )}
        >
          <Icono className="h-3.5 w-3.5" />
          {c.delta > 0 ? "+" : ""}
          {c.delta}
        </span>
      </div>
      <p className="mid-num mt-0.5 text-[12px] text-muted-foreground">
        {c.promedioCon} de 5 {c.etiquetaCon} ({c.diasCon} días) · {c.promedioSin} {c.etiquetaSin} ({c.diasSin} días)
      </p>
    </div>
  );
}
