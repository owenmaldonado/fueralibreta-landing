"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { borrarMovimiento, obtenerMovimientos } from "@/lib/personal/api";
import { categoriaPorClave, pesos } from "@/lib/personal/categorias";
import { MESES_CORTOS, aDate, diasDelMes, formatoLargo, formatoMes, hoy, sumarMeses, type ISODate } from "@/lib/personal/fechas";
import type { Movimiento } from "@/lib/personal/tipos";
import { useColoresGrafica } from "./grafica";
import { EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";
import { EncabezadoPantalla } from "./shell";

/** Meses hacia atrás que se traen para la barra de tendencia. */
const MESES_TENDENCIA = 6;

export function PantallaDinero() {
  const colores = useColoresGrafica();
  const hoyISO = hoy();
  const [ancla, setAncla] = React.useState(() => ({ anio: aDate(hoyISO).getFullYear(), mes: aDate(hoyISO).getMonth() }));
  const [movimientos, setMovimientos] = React.useState<Movimiento[]>([]);
  const [cargando, setCargando] = React.useState(true);

  const dias = React.useMemo(() => diasDelMes(ancla.anio, ancla.mes), [ancla]);
  const primerDia = dias[0];
  const ultimoDia = dias[dias.length - 1];
  // Se cargan también los 5 meses anteriores para la gráfica de tendencia, en
  // una sola consulta en vez de seis.
  const desdeTendencia = React.useMemo(() => sumarMeses(primerDia, -(MESES_TENDENCIA - 1)), [primerDia]);

  React.useEffect(() => {
    let vivo = true;
    setCargando(true);
    obtenerMovimientos(desdeTendencia, ultimoDia)
      .then((m) => vivo && setMovimientos(m))
      .catch((err) => {
        console.error("No se pudieron leer los movimientos:", err);
        if (vivo) toast.error("No se pudo cargar el dinero");
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [desdeTendencia, ultimoDia]);

  const delMes = React.useMemo(
    () => movimientos.filter((m) => m.fecha >= primerDia && m.fecha <= ultimoDia),
    [movimientos, primerDia, ultimoDia]
  );

  const gastado = delMes.filter((m) => m.tipo === "gasto").reduce((a, m) => a + m.monto, 0);
  const recibido = delMes.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0);
  const balance = recibido - gastado;

  const porCategoria = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const m of delMes) {
      if (m.tipo !== "gasto") continue;
      mapa.set(m.categoria, (mapa.get(m.categoria) ?? 0) + m.monto);
    }
    return [...mapa.entries()]
      .map(([clave, monto]) => ({ ...categoriaPorClave(clave), monto }))
      .sort((a, b) => b.monto - a.monto);
  }, [delMes]);

  const tendencia = React.useMemo(() => {
    const filas: { etiqueta: string; gasto: number; ingreso: number }[] = [];
    for (let i = MESES_TENDENCIA - 1; i >= 0; i--) {
      const ref = aDate(sumarMeses(primerDia, -i));
      const anio = ref.getFullYear();
      const mes = ref.getMonth();
      const prefijo = `${anio}-${String(mes + 1).padStart(2, "0")}`;
      const delMesN = movimientos.filter((m) => m.fecha.startsWith(prefijo));
      filas.push({
        etiqueta: MESES_CORTOS[mes],
        gasto: delMesN.filter((m) => m.tipo === "gasto").reduce((a, m) => a + m.monto, 0),
        ingreso: delMesN.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0),
      });
    }
    return filas;
  }, [movimientos, primerDia]);

  const porDia = React.useMemo(() => {
    const mapa = new Map<ISODate, Movimiento[]>();
    for (const m of delMes) {
      const lista = mapa.get(m.fecha);
      if (lista) lista.push(m);
      else mapa.set(m.fecha, [m]);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [delMes]);

  const diasTranscurridos = ultimoDia > hoyISO ? aDate(hoyISO).getDate() : dias.length;
  const promedioDiario = diasTranscurridos > 0 ? gastado / diasTranscurridos : 0;

  async function quitar(id: string) {
    const respaldo = movimientos;
    setMovimientos((l) => l.filter((m) => m.id !== id));
    try {
      await borrarMovimiento(id);
    } catch (err) {
      console.error("No se pudo borrar el movimiento:", err);
      setMovimientos(respaldo);
      toast.error("No se pudo borrar");
    }
  }

  function moverMes(delta: number) {
    setAncla(({ anio, mes }) => {
      const d = new Date(anio, mes + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPantalla titulo="Dinero" descripcion="Lo que entra, lo que sale y a dónde se va" />

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => moverMes(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="mid-display text-[17px]">{formatoMes(ancla.anio, ancla.mes)}</h2>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => moverMes(1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <Tarjeta>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="mid-etiqueta">Gastado</p>
            <p className="mid-num mid-display mt-1 text-[20px]">{pesos(gastado)}</p>
          </div>
          <div>
            <p className="mid-etiqueta">Recibido</p>
            <p className="mid-num mid-display mt-1 text-[20px] text-[hsl(var(--mid-cumplido))]">{pesos(recibido)}</p>
          </div>
          <div>
            <p className="mid-etiqueta">Balance</p>
            <p
              className={cn(
                "mid-num mid-display mt-1 text-[20px]",
                balance < 0 ? "text-destructive" : "text-[hsl(var(--mid-cumplido))]"
              )}
            >
              {balance >= 0 ? "+" : "−"}
              {pesos(Math.abs(balance))}
            </p>
          </div>
        </div>
        {gastado > 0 && (
          <p className="mid-num mt-3 border-t border-border pt-3 text-center text-[12px] text-muted-foreground">
            Promedio {pesos(promedioDiario)} al día · {diasTranscurridos}{" "}
            {diasTranscurridos === 1 ? "día" : "días"} contados
          </p>
        )}
      </Tarjeta>

      <Tarjeta>
        <TituloTarjeta>En qué se va</TituloTarjeta>
        {porCategoria.length === 0 ? (
          <EstadoVacio>Sin gastos este mes.</EstadoVacio>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={168} className="max-w-[200px]">
              <PieChart>
                <Pie
                  data={porCategoria}
                  dataKey="monto"
                  nameKey="etiqueta"
                  innerRadius={44}
                  outerRadius={78}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {porCategoria.map((c) => (
                    <Cell key={c.clave} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={colores.tooltip}
                  formatter={(valor) => pesos(Number(valor ?? 0))}
                />
              </PieChart>
            </ResponsiveContainer>

            <ul className="w-full flex-1 space-y-1.5">
              {porCategoria.map((c) => (
                <li key={c.clave} className="flex items-center gap-2 text-[14px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                  <span className="min-w-0 flex-1 truncate">
                    {c.emoji} {c.etiqueta}
                  </span>
                  <span className="mid-num shrink-0 font-semibold">{pesos(c.monto)}</span>
                  <span className="mid-num w-9 shrink-0 text-right text-[11px] text-muted-foreground">
                    {gastado > 0 ? Math.round((c.monto / gastado) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Tarjeta>

      <Tarjeta>
        <TituloTarjeta>Últimos {MESES_TENDENCIA} meses</TituloTarjeta>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={tendencia} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={colores.reja} />
            <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fill: colores.eje, fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: colores.reja }}
              contentStyle={colores.tooltip}
              formatter={(valor, nombre) => [pesos(Number(valor ?? 0)), nombre === "gasto" ? "Gastado" : "Recibido"]}
            />
            <Bar dataKey="ingreso" fill={colores.verde} radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Bar dataKey="gasto" fill={colores.primario} radius={[4, 4, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      </Tarjeta>

      <Tarjeta>
        <TituloTarjeta>Movimientos</TituloTarjeta>
        {cargando ? (
          <EstadoVacio>Cargando…</EstadoVacio>
        ) : porDia.length === 0 ? (
          <EstadoVacio>Nada registrado este mes.</EstadoVacio>
        ) : (
          <div className="flex flex-col gap-3">
            {porDia.map(([fecha, lista]) => (
              <div key={fecha}>
                <p className="mid-etiqueta mb-1">{formatoLargo(fecha)}</p>
                <ul className="flex flex-col divide-y divide-border">
                  {lista.map((m) => {
                    const cat = categoriaPorClave(m.categoria);
                    return (
                      <li key={m.id} className="flex items-center gap-2.5 py-2">
                        <span
                          aria-hidden
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]"
                          style={{ background: cat.color.replace(")", " / 0.16)") }}
                        >
                          {cat.emoji}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14px]">
                          {cat.etiqueta}
                          {m.nota && <span className="text-muted-foreground"> · {m.nota}</span>}
                        </span>
                        <span
                          className={cn(
                            "mid-num shrink-0 text-[14px] font-semibold",
                            m.tipo === "ingreso" && "text-[hsl(var(--mid-cumplido))]"
                          )}
                        >
                          {m.tipo === "ingreso" ? "+" : "−"}
                          {pesos(m.monto)}
                        </span>
                        <button
                          type="button"
                          onClick={() => quitar(m.id)}
                          aria-label="Borrar movimiento"
                          className="shrink-0 rounded-full p-1 text-muted-foreground/40 transition-colors hover:bg-secondary hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
