"use client";

import * as React from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmptyState } from "@/components/dashboards/empty-state";
import { TrendBarChart } from "@/components/dashboards/trend-bar-chart";
import { TrendLineChart } from "@/components/dashboards/trend-line-chart";
import { PlanGate } from "@/components/dashboards/plan-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/session";
import { formatMoney, fechaCalendarioLocal, todayISO, uid } from "@/lib/mock";
import { aggregateByRange, filterByRango, type RangoTiempo } from "@/lib/chart-buckets";
import { cn } from "@/lib/utils";
import type { Expense, TenantData, FondaOrder } from "@/lib/types";

const RANGO_TABS = [
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

const CHART_TABS = [
  { value: "gastos", label: "Solo Gastos" },
  { value: "ventas", label: "Solo Ventas" },
  { value: "ganancias", label: "Ganancias" },
  { value: "todos", label: "Todos" },
];

const COLOR_VENTAS = "hsl(142 71% 45%)";
const COLOR_GASTOS = "hsl(4 78% 58%)";
const COLOR_GANANCIA = "hsl(217 91% 60%)";

type ChartTab = "gastos" | "ventas" | "ganancias" | "todos";

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
  const [editandoVenta, setEditandoVenta] = React.useState<FondaOrder | null>(null);
  const [borrandoVenta, setBorrandoVenta] = React.useState<FondaOrder | null>(null);
  const [rango, setRango] = React.useState<RangoTiempo>("semanal");
  const [chartTab, setChartTab] = React.useState<ChartTab>("todos");
  const anioActual = new Date().getFullYear();
  const [anioSeleccionado, setAnioSeleccionado] = React.useState(anioActual);

  if (!ready || !session) return <LoadingBlock />;

  const modulo = session.fonda ? "fonda" : "abarrotes";
  const gastos: Expense[] = session.fonda?.gastos ?? session.abarrotes?.gastos ?? [];

  // Un pedido de fonda solo cuenta como venta una vez "entregado" — mientras
  // está pendiente todavía no es dinero cobrado. En Fondita se vende
  // servicio: el precio completo del platillo cuenta, no hay costo de
  // insumo por separado que restar (a diferencia de Abarrotes, que sí tiene
  // costo/precio por producto en Inventario).
  //
  // abarrotes_ventas.fecha es timestamptz en UTC (fonda_pedidos.fecha ya es
  // solo-día) — fechaCalendarioLocal la convierte al día calendario del
  // dispositivo aquí mismo, una sola vez, así todo lo que consume `ventas`
  // de aquí en adelante (el stat de hoy, el selector de año, los filtros de
  // rango y las gráficas) ya trabaja con el día correcto sin tener que
  // repetir la conversión en cada sitio.
  const pedidosEntregados = (session.fonda?.pedidos ?? []).filter((p) => p.estado === "entregado");
  const ventas: Movimiento[] =
    modulo === "fonda"
      ? pedidosEntregados.map((p) => ({ id: p.id, fecha: p.fecha, monto: p.total, label: p.clienteNombre || "Pedido" }))
      : (session.abarrotes?.ventas ?? []).map((v) => ({
          id: v.id,
          fecha: fechaCalendarioLocal(v.fecha),
          monto: v.total,
          label: v.items.length === 1 ? `${v.items[0].cantidad} ${v.items[0].productoNombre}` : `${v.items.length} productos`,
        }));

  // Ganancia = margen (precio_venta - costo) por línea vendida, NO ventas
  // brutas — antes "ganancia" era literalmente ventas - gastos, así que en
  // cuanto gastos_hoy = 0 la línea de ganancia quedaba idéntica a la de
  // ventas (se superponían en la gráfica). costoUnitario es el costo del
  // producto AL MOMENTO de la venta (snapshot que hace cobrar() en
  // VentaCart) — las ventas de antes de ese campo caen al costo ACTUAL del
  // producto. Fondita vende servicio sin costo de insumo por separado
  // (Abarrotes sí lo tiene en Inventario): su "ganancia" es su venta
  // completa, igual que antes.
  const costoPorProducto = new Map((session.abarrotes?.productos ?? []).map((p) => [p.id, p.costo]));
  const gananciaPorVenta: Movimiento[] =
    modulo === "fonda"
      ? ventas
      : (session.abarrotes?.ventas ?? []).map((v) => ({
          id: v.id,
          fecha: fechaCalendarioLocal(v.fecha),
          monto: v.items.reduce((acc, it) => {
            const costo = it.costoUnitario ?? (it.productoId ? costoPorProducto.get(it.productoId) ?? 0 : 0);
            return acc + (it.precioUnitario - costo) * it.cantidad;
          }, 0),
          label: v.items.length === 1 ? `${v.items[0].cantidad} ${v.items[0].productoNombre}` : `${v.items.length} productos`,
        }));

  // Años con al menos un movimiento (para el selector de histórico), más el
  // año en curso aunque todavía no tenga nada — se lee el año directo del
  // string ISO (sin pasar por Date) para no arrastrar corrimientos de UTC.
  const aniosDisponibles = Array.from(
    new Set([anioActual, ...gastos.map((g) => Number(g.fecha.slice(0, 4))), ...ventas.map((v) => Number(v.fecha.slice(0, 4)))])
  ).sort((a, b) => a - b);

  // "Anual" con el año en curso sigue siendo el rolling de los últimos 12
  // meses (el default de siempre). Elegir un año pasado cambia el reloj de
  // referencia al 31 de diciembre de ese año — el mismo rolling de 12 meses
  // "terminando ahí" da exactamente Ene-Dic de ese año, sin duplicar la
  // lógica de buckets.
  const now = rango === "anual" && anioSeleccionado !== anioActual ? new Date(anioSeleccionado, 11, 31) : new Date();

  const hoy = todayISO(0);
  const ventasHoy = ventas.filter((v) => v.fecha === hoy).reduce((acc, v) => acc + v.monto, 0);
  const gastosHoy = gastos.filter((g) => g.fecha === hoy).reduce((acc, g) => acc + g.monto, 0);
  const gananciaBrutaHoy = gananciaPorVenta.filter((g) => g.fecha === hoy).reduce((acc, g) => acc + g.monto, 0);
  const gananciaRealHoy = gananciaBrutaHoy - gastosHoy;

  const gastosFiltrados = filterByRango(gastos, rango, (g) => g.fecha, now).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ventasFiltradas = filterByRango(ventas, rango, (v) => v.fecha, now).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const gananciaPorVentaFiltrada = filterByRango(gananciaPorVenta, rango, (g) => g.fecha, now).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalGastos = gastosFiltrados.reduce((acc, g) => acc + g.monto, 0);
  const totalVentas = ventasFiltradas.reduce((acc, v) => acc + v.monto, 0);
  const totalGananciaBruta = gananciaPorVentaFiltrada.reduce((acc, g) => acc + g.monto, 0);
  const totalGananciaNeta = totalGananciaBruta - totalGastos;

  const combinados = [
    ...ventasFiltradas.map((v) => ({ ...v, tipo: "venta" as const })),
    ...gastosFiltrados.map((g) => ({ id: g.id, fecha: g.fecha, monto: g.monto, label: g.categoria, tipo: "gasto" as const })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Tres pasadas independientes de aggregateByRange (mismo rango + now, así
  // que producen exactamente los mismos buckets en el mismo orden) en vez
  // de una sola con dos series — ganancia ya no es "a - b" del mismo par de
  // datos, así que necesita su propia lista (gananciaPorVenta) agregada
  // aparte.
  const serieGastos = aggregateByRange(gastos, rango, (g) => g.fecha, (g) => g.monto, now);
  const serieVentas = aggregateByRange(ventas, rango, (v) => v.fecha, (v) => v.monto, now);
  const serieGananciaBruta = aggregateByRange(gananciaPorVenta, rango, (g) => g.fecha, (g) => g.monto, now);
  const serieGananciaNeta = serieGananciaBruta.map((g, i) => ({ label: g.label, value: g.value - (serieGastos[i]?.value ?? 0) }));

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

  // Editar/eliminar una venta desde este panel solo aplica a pedidos de
  // Fondita (concepto/monto/hora encajan directo con FondaOrder). Las
  // ventas de Abarrotes ya tienen su propio editor completo en Inventario
  // > Ventas (con items y recálculo de total), así que aquí se quedan de
  // solo lectura para no duplicar ese flujo con uno más simple/menos fiel.
  function abrirEditarVenta(id: string) {
    const pedido = session!.fonda!.pedidos.find((p) => p.id === id);
    if (pedido) setEditandoVenta(pedido);
  }
  function abrirBorrarVenta(id: string) {
    const pedido = session!.fonda!.pedidos.find((p) => p.id === id);
    if (pedido) setBorrandoVenta(pedido);
  }
  function eliminarVenta() {
    if (!borrandoVenta) return;
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, pedidos: f.pedidos.filter((p) => p.id !== borrandoVenta.id) } };
    });
    setBorrandoVenta(null);
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

      {modulo === "abarrotes" && (
        <div className="mx-4 mt-3 rounded-xl border border-border bg-card px-3 py-4">
          <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Hoy</p>
          <div className="mt-2 flex items-center justify-center gap-3 text-center">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ventas hoy</p>
              <p className="font-display text-lg font-bold text-ledger">{formatMoney(ventasHoy)}</p>
            </div>
            <span className="text-muted-foreground">−</span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Gastos hoy</p>
              <p className="font-display text-lg font-bold text-destructive">{formatMoney(gastosHoy)}</p>
            </div>
            <span className="text-muted-foreground">=</span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ganancia real hoy</p>
              <p className={cn("font-display text-lg font-bold", gananciaRealHoy >= 0 ? "text-ledger" : "text-destructive")}>
                {formatMoney(gananciaRealHoy)}
              </p>
            </div>
          </div>
        </div>
      )}

      {chartTab === "gastos" ? (
        <div className="px-4 pt-3">
          <StatTile label="Total gastos" value={formatMoney(totalGastos)} />
        </div>
      ) : chartTab === "ganancias" ? (
        <div className="px-4 pt-3">
          <StatTile label="Total ganancia" value={formatMoney(totalGananciaBruta)} />
        </div>
      ) : chartTab === "ventas" ? (
        modulo === "fonda" ? (
          // Fondita vende servicio: el precio completo del platillo cuenta,
          // sin costo de insumo que restar — por eso aquí son totales de
          // venta, no una "ganancia" con margen.
          <div className="grid grid-cols-2 gap-3 px-4 pt-3">
            <StatTile label="Vendido hoy" value={formatMoney(ventasHoy)} />
            <StatTile label="Vendido en el periodo" value={formatMoney(totalVentas)} />
          </div>
        ) : (
          <div className="px-4 pt-3">
            <StatTile label="Total ventas" value={formatMoney(totalVentas)} />
          </div>
        )
      ) : modulo === "abarrotes" ? null : (
        <div className="px-4 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total ventas" value={formatMoney(totalVentas)} />
            <StatTile label="Total gastos" value={formatMoney(totalGastos)} />
          </div>
          <div className="mt-3 rounded-xl border border-border bg-card px-3 py-3 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">En caja (informativo)</p>
            <p className={cn("font-display text-lg font-bold", totalGananciaNeta >= 0 ? "text-ledger" : "text-destructive")}>
              {formatMoney(totalGananciaNeta)}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 px-4 pt-4">
        <Tabs value={rango} onValueChange={(v) => setRango(v as RangoTiempo)} tabs={RANGO_TABS} />
        {rango === "anual" && aniosDisponibles.length > 1 && (
          <ChipGroup>
            {aniosDisponibles.map((a) => (
              <Chip key={a} selected={anioSeleccionado === a} onClick={() => setAnioSeleccionado(a)}>
                {a}
              </Chip>
            ))}
          </ChipGroup>
        )}
        <PlanGate feature="graficas">
          {chartTab === "gastos" && (
            <TrendBarChart data={serieGastos} bars={[{ key: "value", name: "Gastado", color: COLOR_GASTOS }]} emptyText="Sin gastos en este periodo" />
          )}
          {chartTab === "ventas" && (
            <TrendBarChart data={serieVentas} bars={[{ key: "value", name: "Ventas", color: COLOR_VENTAS }]} emptyText="Sin ventas en este periodo" />
          )}
          {chartTab === "ganancias" && (
            <TrendBarChart
              data={serieGananciaBruta}
              bars={[{ key: "value", name: "Ganancia", color: COLOR_GANANCIA }]}
              emptyText="Sin ganancia en este periodo"
            />
          )}
          {chartTab === "todos" && (
            <TrendLineChart
              data={serieVentas.map((v, i) => ({
                label: v.label,
                ventas: v.value,
                gastos: serieGastos[i]?.value ?? 0,
                ganancia: serieGananciaNeta[i]?.value ?? 0,
              }))}
              // Fondita vende servicio, sin costo de insumo por producto que
              // restar (a diferencia de Abarrotes) — su "ganancia real" sería
              // idéntica a ventas - gastos, una línea sin información nueva
              // que solo confunde. Se omite el prop por completo (en vez de
              // solo el label) porque TrendLineChart ya no dibuja la 3ra
              // línea sin él.
              gananciaLabel={modulo === "abarrotes" ? "Ganancia real" : undefined}
              emptyText="Sin ventas ni gastos en este periodo"
            />
          )}
        </PlanGate>
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
                {modulo === "fonda" && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => abrirEditarVenta(v.id)}
                      aria-label="Editar venta"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => abrirBorrarVenta(v.id)}
                      aria-label="Eliminar venta"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          ))}

        {chartTab === "ganancias" &&
          (gananciaPorVentaFiltrada.length === 0 ? (
            <EmptyState texto="Sin ganancia en este periodo" />
          ) : (
            gananciaPorVentaFiltrada.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.label}</p>
                  <p className="text-xs text-muted-foreground">{formatFechaCorta(g.fecha)}</p>
                </div>
                <span className={cn("shrink-0 font-mono text-sm", g.monto >= 0 ? "text-ledger" : "text-destructive")}>
                  {formatMoney(g.monto)}
                </span>
              </div>
            ))
          ))}

        {chartTab === "todos" &&
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
                {m.tipo === "gasto" && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => {
                        const g = gastos.find((x) => x.id === m.id);
                        if (g) setEditando(g);
                      }}
                      aria-label="Editar gasto"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const g = gastos.find((x) => x.id === m.id);
                        if (g) setBorrando(g);
                      }}
                      aria-label="Eliminar gasto"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {m.tipo === "venta" && modulo === "fonda" && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => abrirEditarVenta(m.id)}
                      aria-label="Editar venta"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => abrirBorrarVenta(m.id)}
                      aria-label="Eliminar venta"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
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

      <Sheet open={!!editandoVenta} onOpenChange={(o) => !o && setEditandoVenta(null)}>
        {editandoVenta && <VentaFondaForm pedido={editandoVenta} onClose={() => setEditandoVenta(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrandoVenta}
        title="Eliminar venta"
        description={`Se borrará el pedido de ${borrandoVenta?.clienteNombre ?? ""} por ${borrandoVenta ? formatMoney(borrandoVenta.total) : ""}.`}
        onClose={() => setBorrandoVenta(null)}
        onConfirm={eliminarVenta}
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

function VentaFondaForm({
  pedido,
  onClose,
  update,
}: {
  pedido: FondaOrder;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [clienteNombre, setClienteNombre] = React.useState(pedido.clienteNombre);
  const [total, setTotal] = React.useState(String(pedido.total));
  const [hora, setHora] = React.useState(pedido.hora);

  const puedeGuardar = clienteNombre.trim().length > 1 && Number(total) > 0 && hora.length > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const f = prev.fonda!;
      return {
        ...prev,
        fonda: {
          ...f,
          pedidos: f.pedidos.map((p) =>
            p.id === pedido.id ? { ...p, clienteNombre: clienteNombre.trim(), total: Number(total), hora } : p
          ),
        },
      };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Editar venta" description="Concepto, monto y hora del pedido" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Concepto (cliente)</Label>
          <Input autoFocus value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div className="space-y-1.5">
          <Label>Monto</Label>
          <Input type="number" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="$0" />
        </div>
        <div className="space-y-1.5">
          <Label>Hora</Label>
          {/* type="time" nativo: siempre 24h real, sin ambigüedad AM/PM. */}
          <Input type="time" min="00:00" max="23:59" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar cambios
        </Button>
      </SheetFooter>
    </>
  );
}
