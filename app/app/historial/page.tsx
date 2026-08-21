"use client";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { EmptyState } from "@/components/dashboards/empty-state";
import { EmpleadoBadge } from "@/components/dashboards/empleado-badge";
import { useSession } from "@/lib/session";
import { formatHora12, formatMoney } from "@/lib/mock";

const LIMITE_CORTES = 50;

export default function HistorialPage() {
  const { session, ready } = useSession();

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  const cortes = data.citas
    .filter((c) => c.estado === "listo")
    .sort((a, b) => `${b.fecha}${b.hora}`.localeCompare(`${a.fecha}${a.hora}`))
    .slice(0, LIMITE_CORTES);

  return (
    <>
      <PageHeader title="Historial" subtitle="Últimos cortes completados" />
      <div className="flex flex-col gap-2 px-4 pb-6">
        {cortes.length === 0 ? (
          <EmptyState texto="Todavía no hay cortes marcados como listos" />
        ) : (
          cortes.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.clienteNombre}</p>
                <p className="text-xs text-muted-foreground">
                  {c.fecha} {formatHora12(c.hora)} · {c.servicioNombre}
                </p>
                <div className="mt-1">
                  <EmpleadoBadge nombre={c.empleadoNombreCache} rol={c.empleadoRolCache} />
                </div>
              </div>
              <span className="shrink-0 font-mono text-sm text-ledger">{formatMoney(c.precio)}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
