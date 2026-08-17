"use client";

import * as React from "react";
import { Trash2, Ban } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { formatMoney, formatHora12 } from "@/lib/mock";
import { getEmpleadoActual, permisosActuales } from "@/lib/empleados";
import { usePendingSalesQueue } from "@/lib/offline-sales-queue";
import { PendingSaleStatus } from "@/components/app-shell/pending-sale-status";
import { cn } from "@/lib/utils";
import type { FondaOrder } from "@/lib/types";

const FILTROS = [
  { value: "pendiente", label: "Pendientes" },
  { value: "entregado", label: "Entregados" },
  { value: "todos", label: "Todos" },
];

const ESTADO_LABEL: Record<string, string> = { pendiente: "pendiente", entregado: "entregado", cancelado: "cancelado" };

export default function PedidosPage() {
  const { session, ready, update } = useSession();
  const [filtro, setFiltro] = React.useState("pendiente");
  const [cancelando, setCancelando] = React.useState<FondaOrder | null>(null);
  const [motivo, setMotivo] = React.useState("");
  // permisosActuales() lee una cookie — se resuelve en un efecto para no
  // desalinear el primer render del servidor con el del cliente (mismo
  // patrón que isAdmin en TopBar). Mientras tanto se asume dueño (no oculta
  // de más ni parpadea el botón de borrar antes de tiempo).
  const [puedeBorrar, setPuedeBorrar] = React.useState(true);

  React.useEffect(() => {
    setPuedeBorrar(permisosActuales().borrarVentas);
  }, []);

  const { rows: ventasPendientesRows } = usePendingSalesQueue(session?.business.id);
  const pedidosPendientesPorId = React.useMemo(
    () => new Map(ventasPendientesRows.filter((r) => r.tipo === "fonda_pedido").map((r) => [r.id, r] as const)),
    [ventasPendientesRows]
  );

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

  function confirmarCancelacion() {
    if (!cancelando) return;
    const actual = getEmpleadoActual();
    update((prev) => {
      const f = prev.fonda!;
      return {
        ...prev,
        fonda: {
          ...f,
          pedidos: f.pedidos.map((p) =>
            p.id === cancelando.id
              ? { ...p, estado: "cancelado" as const, canceladoPor: actual?.nombre ?? "Dueño", motivoCancelacion: motivo.trim() || undefined }
              : p
          ),
        },
      };
    });
    setCancelando(null);
    setMotivo("");
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
                    {formatHora12(p.hora)} · {p.clienteNombre}
                  </p>
                  <PendingSaleStatus negocioId={session.business.id} fila={pedidosPendientesPorId.get(p.id)} />
                  {p.horaEntrega && (
                    <p className="mt-0.5 text-xs font-medium text-primary">Entrega: {formatHora12(p.horaEntrega)}</p>
                  )}
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {p.items.map((it) => (
                      <li key={it.id}>
                        {it.cantidad}× {it.platilloNombre}
                        {it.varianteNombre && ` c/ ${it.varianteNombre}`}
                        {it.nota && <span className="ml-1 font-medium text-destructive">· {it.nota}</span>}
                        {it.extraMonto != null && (
                          <span className="ml-1 font-medium text-primary">
                            · +{formatMoney(it.extraMonto)} {it.extraConcepto}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {p.estado === "cancelado" && p.motivoCancelacion && (
                    <p className="mt-1.5 text-xs text-destructive">
                      Cancelado por {p.canceladoPor ?? "—"}: {p.motivoCancelacion}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="font-mono text-sm">{formatMoney(p.total)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                      p.estado === "pendiente"
                        ? "bg-primary/15 text-primary"
                        : p.estado === "cancelado"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-ledger/15 text-ledger"
                    )}
                  >
                    {ESTADO_LABEL[p.estado]}
                  </span>
                </div>
              </div>
              {p.estado !== "cancelado" && (
                <div className="mt-3 flex gap-2">
                  {p.estado === "pendiente" && (
                    <Button size="sm" variant="ledger" className="flex-1" onClick={() => marcarEntregado(p.id)}>
                      ✔️ Entregado
                    </Button>
                  )}
                  {puedeBorrar ? (
                    <Button size="sm" variant="outline" onClick={() => eliminar(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setCancelando(p)}>
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Dialog open={!!cancelando} onOpenChange={(o) => !o && setCancelando(null)}>
        <DialogHeader title="Cancelar pedido" description={`${cancelando?.clienteNombre} · ${cancelando ? formatMoney(cancelando.total) : ""}`} onClose={() => setCancelando(null)} />
        <Input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelando(null)}>
            Cerrar
          </Button>
          <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmarCancelacion}>
            Cancelar pedido
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
