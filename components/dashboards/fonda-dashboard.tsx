"use client";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { StatTile } from "./stat-tile";
import { EmptyState } from "./empty-state";
import { formatMoney } from "@/lib/mock";
import type { TenantData, SessionUpdater } from "@/lib/types";

export function FondaDashboard({ session, update }: { session: TenantData; update: SessionUpdater }) {
  const data = session.fonda!;
  const pendientes = data.pedidos.filter((p) => p.estado === "pendiente").sort((a, b) => a.hora.localeCompare(b.hora));
  const ventasHoy = data.pedidos.reduce((acc, p) => acc + p.total, 0);
  const gastosHoy = data.gastos.reduce((acc, g) => acc + g.monto, 0);

  function marcarEntregado(id: string) {
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, pedidos: f.pedidos.map((p) => (p.id === id ? { ...p, estado: "entregado" as const } : p)) } };
    });
  }

  return (
    <>
      <PageHeader title="Hoy" subtitle="Pedidos y ventas de la fonda" />
      <div className="grid grid-cols-2 gap-3 px-4">
        <StatTile label="Ventas hoy" value={formatMoney(ventasHoy)} />
        <StatTile label="Gastos hoy" value={formatMoney(gastosHoy)} />
      </div>
      <div className="flex flex-col gap-3 px-4 py-6">
        <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Pedidos pendientes · {pendientes.length}
        </p>
        {pendientes.length === 0 ? (
          <EmptyState texto="No hay pedidos pendientes 🎉" />
        ) : (
          pendientes.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {p.hora} · {p.clienteNombre}
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {p.items.map((it) => (
                      <li key={it.id}>
                        {it.cantidad}× {it.platilloNombre}
                        {it.nota && <span className="ml-1 font-medium text-destructive">· {it.nota}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <span className="shrink-0 font-mono text-sm">{formatMoney(p.total)}</span>
              </div>
              <Button size="sm" variant="ledger" className="mt-3 w-full" onClick={() => marcarEntregado(p.id)}>
                ✔️ Entregado
              </Button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
