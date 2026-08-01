"use client";

import { Banknote, CreditCard, HandCoins, Receipt } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { formatMoney } from "@/lib/mock";
import { cn } from "@/lib/utils";

const ICONS = { venta: Banknote, propina: HandCoins, gasto: Receipt };

export default function CajaPage() {
  const { session, ready } = useSession();
  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  const ventas = data.caja.filter((e) => e.tipo === "venta").reduce((acc, e) => acc + e.monto, 0);
  const propinas = data.caja.filter((e) => e.tipo === "propina").reduce((acc, e) => acc + e.monto, 0);
  const efectivo = data.caja.filter((e) => e.tipo !== "gasto" && e.metodo === "efectivo").reduce((acc, e) => acc + e.monto, 0);
  const transferencia = data.caja.filter((e) => e.tipo !== "gasto" && e.metodo === "transferencia").reduce((acc, e) => acc + e.monto, 0);

  const movimientos = [...data.caja].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <>
      <PageHeader title="Caja" subtitle="Ventas, propinas y gastos" />
      <div className="grid grid-cols-2 gap-3 px-4">
        <StatTile label="Ventas" value={formatMoney(ventas)} />
        <StatTile label="Propinas" value={formatMoney(propinas)} />
        <StatTile label="Efectivo" value={formatMoney(efectivo)} />
        <StatTile label="Transferencia" value={formatMoney(transferencia)} />
      </div>

      <div className="flex flex-col gap-2 px-4 py-6">
        <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Movimientos</p>
        {movimientos.length === 0 ? (
          <EmptyState texto="Sin movimientos todavía" />
        ) : (
          movimientos.map((m) => {
            const Icon = ICONS[m.tipo];
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    m.tipo === "gasto" ? "bg-destructive/10 text-destructive" : "bg-ledger/10 text-ledger"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.concepto}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {new Date(m.fecha).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    <CreditCard className="hidden h-3 w-3" />
                    · {m.metodo === "efectivo" ? "Efectivo" : "Transferencia"}
                  </p>
                </div>
                <span className={cn("shrink-0 font-mono text-sm", m.tipo === "gasto" ? "text-destructive" : "text-foreground")}>
                  {m.tipo === "gasto" ? "-" : "+"}
                  {formatMoney(m.monto)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
