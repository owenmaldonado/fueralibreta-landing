import { Users, Building2, NotebookText, Sparkles, Scissors, Soup, ShoppingBasket } from "lucide-react";

import type { AdminMetrics } from "@/lib/admin-data";
import { cn } from "@/lib/utils";

export function MetricsCards({ metrics }: { metrics: AdminMetrics }) {
  const cards = [
    { label: "Total usuarios", value: metrics.totalUsuarios, icon: Users, tone: "text-primary bg-primary/10" },
    { label: "Negocios activos", value: metrics.totalNegocios, icon: Building2, tone: "text-ledger bg-ledger/10" },
    { label: "Libretas digitalizadas", value: metrics.totalMovimientos, icon: NotebookText, tone: "text-primary bg-primary/10" },
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
    </div>
  );
}
