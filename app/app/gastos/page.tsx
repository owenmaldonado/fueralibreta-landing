"use client";

import * as React from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmptyState } from "@/components/dashboards/empty-state";
import { TrendBarChart } from "@/components/dashboards/trend-bar-chart";
import { TrendLineChart } from "@/components/dashboards/trend-line-chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/session";
import { formatMoney, todayISO, uid } from "@/lib/mock";
import { aggregateByRange, aggregateTwoByRange, filterByRango, type RangoTiempo } from "@/lib/chart-buckets";
import { cn } from "@/lib/utils";
import type { Expense, TenantData } from "@/lib/types";

const RANGO_TABS = [
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

const CHART_TABS = [
  { value: "gastos", label: "Solo Gastos" },
  { value: "ventas", label: "Solo Ventas" },
  { value: "ambos", label: "Ambos" },
];

type ChartTab = "gastos" | "ventas" | "ambos";

interface Movimiento {
  id: string;
  fecha: string;
  monto: number;
  label: string;
}

function formatFechaCorta(fecha: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T00:00:00`) : new Date(fecha);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Página compartida por Fonda y Abarrotes: ambas guardan gastos con la misma forma. */
export default function GastosPage() {
  const { session, ready, update } = useSession();
  const [addOpen, setAddOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<Expense | null>(null);
  const [borrando, setBorrando] = React.useState<Expense | null>(null);
  const [rango, setRango] = React.useState<RangoTiempo>("semanal");
  const [chartTab, setChartTab] = React.useState<ChartTab>("ambos");

  if (!ready || !session) return <LoadingBlock />;

  const modulo = session.fonda ? "fonda" : "abarrotes";
  const gastos: Expense[] = session.fonda?.gastos ?? session.abarrotes?.gastos ?? [];

  // Un pedido de fonda solo cuenta como venta una vez "entregado" — mientras
  // está pendiente todavía no es dinero cobrado.
  const pedidosEntregados = (session.fonda?.pedidos ?? []).filter((p) => p.estado === "entregado");
  const ventas: Movimiento[] =
    modulo === "fonda"
      ? pedidosEntregados.map((p) => ({ id: p.id, fecha: p.fecha, monto: p.total, label: p.clienteNombre || "Pedido" }))
      : (session.abarrotes?.ventas ?? []).map((v) => ({
          id: v.id,
          fecha: v.fecha,
          monto: v.total,
          label: v.items.length === 1 ? `${v.items[0].cantidad} ${v.items[0].productoNombre}` : `${v.items.length} productos`,
        }));

  const gastosFiltrados = filterByRango(gastos, rango, (g) => g.fecha).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ventasFiltradas = filterByRango(ventas, rango, (v) => v.fecha).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalGastos = gastosFiltrados.reduce((acc, g) => acc + g.monto, 0);
  const totalVentas = ventasFiltradas.reduce((acc, v) => acc + v.monto, 0);
  const ganancia = totalVentas - totalGastos;

  const combinados = [
    ...ventasFiltradas.map((v) => ({ ...v, tipo: "venta" as const })),
    ...gastosFiltrados.map((g) => ({ id: g.id, fecha: g.fecha, monto: g.monto, label: g.categoria, tipo: "gasto" as const })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const serieGastos = aggregateByRange(gastos, rango, (g) => g.fecha, (g) => g.monto);
  const serieVentas = aggregateByRange(ventas, rango, (v) => v.fecha, (v) => v.monto);
  const serieDoble = aggregateTwoByRange(
    [...ventas.map((v) => ({ fecha: v.fecha, a: v.monto, b: 0 })), ...gastos.map((g) => ({ fecha: g.fecha, a: 0, b: g.monto }))],
    rango,
    (x) => x.fecha,
    (x) => ({ a: x.a, b: x.b })
  );

  function withGastos(prev: TenantData, next: (gastos: Expense[]) => Expense[]): TenantData {
    if (prev.fonda) return { ...prev, fonda: { ...prev.fonda, gastos: next(prev.fonda.gastos) } };
    if (prev.abarrotes) return { ...prev, abarrotes: { ...prev.abarrotes, gastos: next(prev.abarrotes.gastos) } };
    return prev;
  }

  function eliminar() {
    if (!borrando) return;
    update((prev) => withGastos(prev, (g) => g.filter((x) => x.id !== borrando.id)));
    setBorrando(null);
  }

  return (
    <>
      <PageHeader
        title="Gastos / Ventas"
        subtitle="Lo que entra y lo que sale"
        action={
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        }
      />

      <div className="px-4">
        <Tabs value={chartTab} onValueChange={(v) => setChartTab(v as ChartTab)} tabs={CHART_TABS} />
      </div>

      {chartTab === "ambos" ? (
        <div className="mx-4 mt-3 flex items-center justify-center gap-3 rounded-xl border border-border bg-card px-3 py-4 text-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ventas</p>
            <p className="font-display text-lg font-bold text-ledger">{formatMoney(totalVentas)}</p>
          </div>
          <span className="text-muted-foreground">−</span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Gastos</p>
            <p className="font-display text-lg font-bold text-destructive">{formatMoney(totalGastos)}</p>
          </div>
          <span className="text-muted-foreground">=</span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ganancia</p>
            <p className={cn("font-display text-lg font-bold", ganancia >= 0 ? "text-ledger" : "text-destructive")}>
              {formatMoney(ganancia)}
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-3">
          <StatTile label={chartTab === "gastos" ? "Total gastos" : "Total ventas"} value={formatMoney(chartTab === "gastos" ? totalGastos : totalVentas)} />
        </div>
      )}

      <div className="flex flex-col gap-3 px-4 pt-4">
        <Tabs value={rango} onValueChange={(v) => setRango(v as RangoTiempo)} tabs={RANGO_TABS} />
        {chartTab === "gastos" && (
          <TrendBarChart data={serieGastos} bars={[{ key: "value", name: "Gastado", color: "hsl(4 78% 58%)" }]} emptyText="Sin gastos en este periodo" />
        )}
        {chartTab === "ventas" && (
          <TrendBarChart data={serieVentas} bars={[{ key: "value", name: "Ventas", color: "hsl(142 71% 45%)" }]} emptyText="Sin ventas en este periodo" />
        )}
        {chartTab === "ambos" && (
          <TrendLineChart
            data={serieDoble.map((s) => ({ label: s.label, ventas: s.a, gastos: s.b }))}
            emptyText="Sin ventas ni gastos en este periodo"
          />
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 py-6">
        {chartTab === "gastos" &&
          (gastosFiltrados.length === 0 ? (
            <EmptyState texto="Sin gastos en este periodo" />
          ) : (
            gastosFiltrados.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.categoria}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFechaCorta(g.fecha)}
                    {g.recordatorio && " · recordatorio activo"}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm text-destructive">-{formatMoney(g.monto)}</span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => setEditando(g)}
                    aria-label="Editar gasto"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setBorrando(g)}
                    aria-label="Eliminar gasto"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ))}

        {chartTab === "ventas" &&
          (ventasFiltradas.length === 0 ? (
            <EmptyState texto="Sin ventas en este periodo" />
          ) : (
            ventasFiltradas.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.label}</p>
                  <p className="text-xs text-muted-foreground">{formatFechaCorta(v.fecha)}</p>
                </div>
                <span className="shrink-0 font-mono text-sm text-ledger">+{formatMoney(v.monto)}</span>
              </div>
            ))
          ))}

        {chartTab === "ambos" &&
          (combinados.length === 0 ? (
            <EmptyState texto="Sin movimientos en este periodo" />
          ) : (
            combinados.map((m) => (
              <div key={`${m.tipo}-${m.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{formatFechaCorta(m.fecha)}</p>
                </div>
                <span className={cn("shrink-0 font-mono text-sm", m.tipo === "venta" ? "text-ledger" : "text-destructive")}>
                  {m.tipo === "venta" ? "+" : "-"}
                  {formatMoney(m.monto)}
                </span>
              </div>
            ))
          ))}
      </div>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <GastoForm modulo={modulo} onClose={() => setAddOpen(false)} update={update} />
      </Sheet>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <GastoForm modulo={modulo} gasto={editando} onClose={() => setEditando(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar gasto"
        description={`Se borrará "${borrando?.categoria}" por ${borrando ? formatMoney(borrando.monto) : ""}.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminar}
      />
    </>
  );
}

function GastoForm({
  modulo,
  gasto,
  onClose,
  update,
}: {
  modulo: "fonda" | "abarrotes";
  gasto?: Expense;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [categoria, setCategoria] = React.useState(gasto?.categoria ?? "");
  const [monto, setMonto] = React.useState(String(gasto?.monto ?? ""));
  const [fecha, setFecha] = React.useState(gasto?.fecha ?? todayISO(0));
  const [recordatorio, setRecordatorio] = React.useState(gasto?.recordatorio ?? false);

  const puedeGuardar = categoria.trim().length > 1 && Number(monto) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const datos = { categoria: categoria.trim(), monto: Number(monto), fecha, recordatorio };
      if (gasto) {
        if (prev.fonda) {
          return { ...prev, fonda: { ...prev.fonda, gastos: prev.fonda.gastos.map((g) => (g.id === gasto.id ? { ...g, ...datos } : g)) } };
        }
        if (prev.abarrotes) {
          return {
            ...prev,
            abarrotes: { ...prev.abarrotes, gastos: prev.abarrotes.gastos.map((g) => (g.id === gasto.id ? { ...g, ...datos } : g)) },
          };
        }
        return prev;
      }
      const nuevo: Expense = { id: uid("exp"), ...datos };
      if (modulo === "fonda" && prev.fonda) {
        return { ...prev, fonda: { ...prev.fonda, gastos: [nuevo, ...prev.fonda.gastos] } };
      }
      if (modulo === "abarrotes" && prev.abarrotes) {
        return { ...prev, abarrotes: { ...prev.abarrotes, gastos: [nuevo, ...prev.abarrotes.gastos] } };
      }
      return prev;
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title={gasto ? "Editar gasto" : "Nuevo gasto"} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Input autoFocus value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej. Renta, Gas, Luz..." />
        </div>
        <div className="space-y-1.5">
          <Label>Monto</Label>
          <Input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0" />
        </div>
        <div className="space-y-1.5">
          <Label>Fecha</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <p className="text-sm font-medium">Recordarme</p>
          <Switch checked={recordatorio} onCheckedChange={setRecordatorio} />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          {gasto ? "Guardar cambios" : "Guardar gasto"}
        </Button>
      </SheetFooter>
    </>
  );
}
