"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { useConsent } from "@/lib/consent";
import { formatMoney } from "@/lib/mock";

const GRID = "hsl(220 10% 22%)";
const AXIS = "hsl(220 8% 63%)";
const TOOLTIP_BG = "hsl(220 14% 12%)";
const COLOR_VENTAS = "hsl(142 71% 45%)";
const COLOR_GASTOS = "hsl(4 78% 58%)";

interface TrendLineChartProps {
  data: Array<{ label: string; ventas: number; gastos: number }>;
  emptyText?: string;
}

/** Gráfica de líneas dobles (ventas vs gastos), para comparar las dos series en un mismo periodo. */
export function TrendLineChart({ data, emptyText = "Sin datos en este periodo" }: TrendLineChartProps) {
  const consent = useConsent();
  const total = data.reduce((acc, row) => acc + row.ventas + row.gastos, 0);

  if (consent === "rejected") {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-6 text-center">
        <p className="text-sm text-muted-foreground">Gráficas deshabilitadas</p>
        <p className="text-xs text-muted-foreground">Acepta el aviso de cookies para verlas.</p>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: COLOR_VENTAS }} />
          Ventas
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: COLOR_GASTOS }} />
          Gastos
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={data.length > 20 ? Math.ceil(data.length / 10) : 0}
            tick={{ fill: AXIS, fontSize: 11 }}
          />
          <Tooltip
            cursor={{ stroke: "hsl(220 12% 30%)" }}
            contentStyle={{
              background: TOOLTIP_BG,
              border: "1px solid hsl(220 10% 22%)",
              borderRadius: 10,
              fontSize: 12,
              color: "hsl(42 24% 95%)",
            }}
            labelStyle={{ color: AXIS, marginBottom: 4 }}
            formatter={(value, name) => [formatMoney(Number(value)), String(name)]}
          />
          <Line type="monotone" dataKey="ventas" name="Ventas" stroke={COLOR_VENTAS} strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="gastos" name="Gastos" stroke={COLOR_GASTOS} strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
