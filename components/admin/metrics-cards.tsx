"use client";

import * as React from "react";
import { Users, Building2, DollarSign, Sparkles, Scissors, Soup, ShoppingBasket } from "lucide-react";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import type { AdminMetrics } from "@/lib/admin-data";
import { formatMoney } from "@/lib/mock";
import { cn } from "@/lib/utils";

const TIPO_COLOR: Record<string, string> = {
  barberia: "bg-primary",
  fonda: "bg-ledger",
  abarrotes: "bg-destructive",
};

function MrrChartModal({ open, onClose, mrrPorNegocio, total }: { open: boolean; onClose: () => void; mrrPorNegocio: AdminMetrics["mrrPorNegocio"]; total: number }) {
  const max = Math.max(...mrrPorNegocio.map((n) => n.monto), 1);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} className="max-w-lg">
      <DialogHeader title="Dinero mensual" onClose={onClose} />
      <div className="space-y-4">
        <div>
          <p className="font-display text-3xl font-bold text-ledger">{formatMoney(total)}</p>
          <p className="text-xs text-muted-foreground">Suma de lo que pagan tus negocios activos al mes (no cuenta fundadores)</p>
        </div>

        {mrrPorNegocio.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Ningún negocio está pagando todavía.</p>
        ) : (
          <div className="space-y-2.5">
            {mrrPorNegocio.map((n) => (
              <div key={n.nombre} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{n.nombre}</span>
                  <span className="font-mono text-muted-foreground">{formatMoney(n.monto)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn("h-full rounded-full", TIPO_COLOR[n.tipo] ?? "bg-primary")}
                    style={{ width: `${(n.monto / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function MetricsCards({ metrics }: { metrics: AdminMetrics }) {
  const [showMrr, setShowMrr] = React.useState(false);

  const cards = [
    { label: "Total usuarios", value: metrics.totalUsuarios, icon: Users, tone: "text-primary bg-primary/10" },
    { label: "Negocios activos", value: metrics.totalNegocios, icon: Building2, tone: "text-ledger bg-ledger/10" },
    { label: "Usuarios nuevos hoy", value: metrics.usuariosNuevosHoy, icon: Sparkles, tone: "text-destructive bg-destructive/10" },
  ];

  const cardsPorTipo = [
    { label: "Barberías", value: metrics.totalBarberias, icon: Scissors, tone: "text-primary bg-primary/10" },
    { label: "Fonditas", value: metrics.totalFondas, icon: Soup, tone: "text-ledger bg-ledger/10" },
    { label: "Abarroteras", value: metrics.totalAbarrotes, icon: ShoppingBasket, tone: "text-destructive bg-destructive/10" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setShowMrr(true)}
          className="rounded-2xl border border-primary/40 bg-primary/5 p-5 text-left transition-colors hover:bg-primary/10"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ledger/10 text-ledger">
            <DollarSign className="h-5 w-5" />
          </div>
          <p className="mt-4 font-display text-3xl font-bold tracking-tight text-ledger">{formatMoney(metrics.mrrMensual)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Dinero mensual · ver gráfica</p>
        </button>
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", c.tone)}>
              <c.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 font-display text-3xl font-bold tracking-tight">{c.value.toLocaleString("es-MX")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {cardsPorTipo.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", c.tone)}>
                <c.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="font-display text-lg font-bold leading-none tracking-tight">{c.value.toLocaleString("es-MX")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <MrrChartModal open={showMrr} onClose={() => setShowMrr(false)} mrrPorNegocio={metrics.mrrPorNegocio} total={metrics.mrrMensual} />
    </div>
  );
}
