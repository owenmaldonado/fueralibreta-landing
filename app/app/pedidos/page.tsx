"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { formatMoney, formatHora12 } from "@/lib/mock";
import { cn } from "@/lib/utils";

const FILTROS = [
  { value: "pendiente", label: "Pendientes" },
  { value: "entregado", label: "Entregados" },
  { value: "todos", label: "Todos" },
];

export default function PedidosPage() {
  const { session, ready, update } = useSession();
  const [filtro, setFiltro] = React.useState("pendiente");

  if (!ready || !session) return <LoadingBlock />;

  const data = session.fonda!;
  const pedidos = data.pedidos
    .filter((p) => filtro === "todos" || p.estado === filtro)
    .sort((a, b) => b.hora.localeCompare(a.hora));

  function marcarEntregado(id: string) {
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, pedidos: f.pedidos.map((p) => (p.id === id ? { ...p, estado: "entregado" as const } : p)) } };
    });
  }

  function eliminar(id: string) {
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, pedidos: f.pedidos.filter((p) => p.id !== id) } };
    });
  }

  return (
    <>
      <PageHeader title="Pedidos" subtitle={`${data.pedidos.length} en total`} />
      <div className="px-4 pb-4">
        <Tabs value={filtro} onValueChange={setFiltro} tabs={FILTROS} />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-6">
        {pedidos.length === 0 ? (
          <EmptyState texto="Sin pedidos aquí" />
        ) : (
          pedidos.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {p.hora} · {p.clienteNombre}
                  </p>
                  {p.horaEntrega && (
                    <p className="mt-0.5 text-xs font-medium text-primary">Entrega: {formatHora12(p.horaEntrega)}</p>
                  )}
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {p.items.map((it) => (
                      <li key={it.id}>
                        {it.cantidad}× {it.platilloNombre}
                        {it.nota && <span className="ml-1 font-medium text-destructive">· {it.nota}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="font-mono text-sm">{formatMoney(p.total)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                      p.estado === "pendiente" ? "bg-primary/15 text-primary" : "bg-ledger/15 text-ledger"
                    )}
                  >
                    {p.estado}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {p.estado === "pendiente" && (
                  <Button size="sm" variant="ledger" className="flex-1" onClick={() => marcarEntregado(p.id)}>
                    ✔️ Entregado
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => eliminar(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
