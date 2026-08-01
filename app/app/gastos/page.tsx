"use client";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { formatMoney } from "@/lib/mock";
import type { Expense } from "@/lib/types";

/** Página compartida por Fonda y Abarrotes: ambas guardan gastos con la misma forma. */
export default function GastosPage() {
  const { session, ready } = useSession();
  if (!ready || !session) return <LoadingBlock />;

  const gastos: Expense[] = session.fonda?.gastos ?? session.abarrotes?.gastos ?? [];
  const total = gastos.reduce((acc, g) => acc + g.monto, 0);
  const ordenados = [...gastos].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <>
      <PageHeader title="Gastos" subtitle="Lo que sale del negocio" />
      <div className="px-4">
        <StatTile label="Total registrado" value={formatMoney(total)} />
      </div>
      <div className="flex flex-col gap-2 px-4 py-6">
        {ordenados.length === 0 ? (
          <EmptyState texto="Sin gastos registrados" />
        ) : (
          ordenados.map((g) => (
            <div key={g.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div>
                <p className="text-sm font-medium">{g.categoria}</p>
                <p className="text-xs text-muted-foreground">
                  {g.fecha}
                  {g.recordatorio && " · recordatorio activo"}
                </p>
              </div>
              <span className="font-mono text-sm text-destructive">-{formatMoney(g.monto)}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
