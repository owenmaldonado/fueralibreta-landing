"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { useConsent } from "@/lib/consent";
import { formatMoney } from "@/lib/mock";

const GRID = "hsl(220 10% 22%)";
const AXIS = "hsl(220 8% 63%)";
const TOOLTIP_BG = "hsl(220 14% 12%)";

export interface TrendBarSpec {
  key: string;
  name: string;
  color: string;
}

interface TrendBarChartProps {
  data: Array<{ label: string } & Record<string, number | string>>;
  bars: TrendBarSpec[];
  emptyText?: string;
}

/** Gráfica de barras compacta, tema oscuro, para tendencias semanal/mensual/anual. */
export function TrendBarChart({ data, bars, emptyText = "Sin datos en este periodo" }: TrendBarChartProps) {
  const consent = useConsent();
  const total = data.reduce((acc, row) => acc + bars.reduce((a, b) => a + Number(row[b.key] ?? 0), 0), 0);

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
      {bars.length > 1 && (
        <div className="mb-2 flex items-center gap-4 px-1">
          {bars.map((b) => (
            <div key={b.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
              {b.name}
            </div>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap={data.length > 20 ? 1 : "22%"}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={data.length > 20 ? Math.ceil(data.length / 10) : 0}
            tick={{ fill: AXIS, fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: "hsl(220 12% 16%)" }}
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
          {bars.map((b) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.name}
              fill={b.color}
              radius={bars.length > 1 ? [4, 4, 0, 0] : [6, 6, 0, 0]}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
