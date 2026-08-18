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
import { BloqueoPlan } from "@/components/dashboards/bloqueo-plan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PendingSaleStatus } from "@/components/app-shell/pending-sale-status";
import { VentaForm } from "@/components/abarrotes/venta-form";
import { useSession } from "@/lib/session";
import { formatMoney, fechaCalendarioLocal, todayISO, uid } from "@/lib/mock";
import { aggregateByRange, filterByRango, type RangoTiempo } from "@/lib/chart-buckets";
import { permisosActuales, getEmpleadoActual } from "@/lib/empleados";
import { usePendingSalesQueue } from "@/lib/offline-sales-queue";
import { usePlan } from "@/lib/planes";
import { cn } from "@/lib/utils";
import type { Expense, TenantData, FondaOrder, GrocerySale } from "@/lib/types";

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
  const plan = usePlan();
  const [addOpen, setAddOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<Expense | null>(null);
  const [borrando, setBorrando] = React.useState<Expense | null>(null);
  const [editandoVenta, setEditandoVenta] = React.useState<FondaOrder | null>(null);
  const [borrandoVenta, setBorrandoVenta] = React.useState<FondaOrder | null>(null);
  const [editandoVentaAbarrotes, setEditandoVentaAbarrotes] = React.useState<GrocerySale | null>(null);
  const [borrandoVentaAbarrotes, setBorrandoVentaAbarrotes] = React.useState<GrocerySale | null>(null);
  const [rango, setRango] = React.useState<RangoTiempo>("semanal");
  const [chartTab, setChartTab] = React.useState<ChartTab>("todos");
  const anioActual = new Date().getFullYear();
  const [anioSeleccionado, setAnioSeleccionado] = React.useState(anioActual);
  // Multiusuario: un rol "vendedor" no puede borrar ventas — se resuelve en
  // un efecto (permisosActuales lee una cookie) para no desalinear el
  // primer render del servidor con el del cliente. Mismo patrón que
  // Inventario, de donde se movió esta lista (ver VentaForm).
  const [puedeBorrarVentas, setPuedeBorrarVentas] = React.useState(true);

  React.useEffect(() => {
    setPuedeBorrarVentas(permisosActuales().borrarVentas);
  }, []);

  const { rows: ventasPendientesRows } = usePendingSalesQueue(session?.business.id);
  const ventasPendientesPorId = React.useMemo(
    () => new Map(ventasPendientesRows.filter((r) => r.tipo === "abarrotes_venta").map((r) => [r.id, r] as const)),
    [ventasPendientesRows]
  );

  if (!ready || !session) return <LoadingBlock />;

  const modulo = session.fonda ? "fonda" : "abarrotes";
  const gastos: Expense[] = session.fonda?.gastos ?? session.abarrotes?.gastos ?? [];

  // Un pedido de fonda solo cuenta como venta una vez "entregado" — mientras
  // está pendiente todavía no es dinero cobrado.
  //
  // abarrotes_ventas.fecha es timestamptz en UTC (fonda_pedidos.fecha ya es
  // solo-día) — fechaCalendarioLocal la convierte al día calendario del
  // dispositivo aquí mismo, una sola vez, así todo lo que consume `ventas`
  // de aquí en adelante (el stat de hoy, el selector de año, los filtros de
  // rango y las gráficas) ya trabaja con el día correcto sin tener que
  // repetir la conversión en cada sitio.
  const pedidosEntregados = (session.fonda?.pedidos ?? []).filter((p) => p.estado === "entregado");
  // cancelada excluye una venta de Abarrotes de ventas/ganancias sin
  // borrarla (un rol "vendedor" no puede borrar, solo cancelar — ver
  // PERMISOS en lib/empleados.ts); fonda ya queda afuera con el filtro de
  // "entregado" de arriba, "cancelado" nunca entra ahí.
  const ventasAbarrotesActivas = (session.abarrotes?.ventas ?? []).filter((v) => !v.cancelada);
  const ventas: Movimiento[] =
    modulo === "fonda"
      ? pedidosEntregados.map((p) => ({ id: p.id, fecha: p.fecha, monto: p.total, label: p.clienteNombre || "Pedido" }))
      : ventasAbarrotesActivas.map((v) => ({
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
  // producto.
  //
  // Fondita: cada Dish tiene un `costo` opcional (agregado en Menú > Editar
  // platillo). Un platillo SIN costo no aporta margen conocido — su venta
  // cuenta $0 de ganancia (ni se inventa como venta completa, ni se excluye
  // del todo: así una fonda con solo ALGUNOS platillos con costo sigue
  // viendo la ganancia real de esos, en vez de todo-o-nada). OrderItem
  // guarda precioUnitario/costoUnitario como snapshot AL MOMENTO del pedido
  // (ver venderRapido en fonda-dashboard.tsx y agregarItem en
  // fonda-quick-add.tsx) — igual que costoUnitario en Abarrotes, editar el
  // precio o el costo del platillo DESPUÉS ya no mueve ventas ya hechas.
  // Pedidos de antes de este snapshot (sin precioUnitario guardado) siguen
  // cayendo al platillo/variante ACTUAL, único caso con ese trade-off.
  const costoPorProducto = new Map((session.abarrotes?.productos ?? []).map((p) => [p.id, p.costo]));
  const platillosPorId = new Map((session.fonda?.platillos ?? []).map((p) => [p.id, p]));
  const gananciaPorVenta: Movimiento[] =
    modulo === "fonda"
      ? pedidosEntregados.map((p) => ({
          id: p.id,
          fecha: p.fecha,
          monto: p.items.reduce((acc, it) => {
            if (it.precioUnitario != null) {
              const costo = it.costoUnitario ?? 0;
              return costo > 0 ? acc + (it.precioUnitario - costo) * it.cantidad : acc;
            }
            const platillo = platillosPorId.get(it.platilloId);
            if (!platillo || platillo.costo == null) return acc;
            const extra = it.varianteNombre ? platillo.variantes?.find((v) => v.valor === it.varianteNombre)?.precioExtra ?? 0 : 0;
            return acc + (platillo.precio + extra - platillo.costo) * it.cantidad;
          }, 0),
          label: p.clienteNombre || "Pedido",
        }))
      : ventasAbarrotesActivas.map((v) => ({
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

  // Ganancia real de Fondita solo existe para los platillos que tienen
  // costo puesto (ver arriba, gananciaPorVenta). Si NINGUNO lo tiene, la
  // "ganancia" calculada sería 0 en todos lados — en vez de mostrar esa
  // gráfica en blanco sin explicación, se avisa que falta el costo. En
  // cuanto al menos uno lo tiene, el número ya es real (aunque parcial) y
  // deja de mostrarse el aviso.
  const algunPlatilloConCosto = modulo === "fonda" && (session.fonda?.platillos ?? []).some((p) => p.costo != null && p.costo > 0);
  const faltaCostoEnFonda = modulo === "fonda" && !algunPlatilloConCosto;

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

  // Editar/eliminar una venta de Fondita (concepto/monto/hora encajan
  // directo con FondaOrder).
  function abrirEditarVenta(id: string) {
    const pedido = session!.fonda!.pedidos.find((p) => p.id === id);
    if (pedido) setEditandoVenta(pedido);
  }
  function abrirBorrarVenta(id: string) {
    const pedido = session!.fonda!.pedidos.find((p) => p.id === id);
    if (pedido) setBorrandoVenta(pedido);
  }
  // Ya no borra el pedido — lo cancela (mismo mecanismo que "Cancelar" en
  // Pedidos): pedidosEntregados de arriba filtra por estado === "entregado",
  // así que un pedido cancelado sale solo de ventas/gráficas/totales, pero
  // el pedido sigue existiendo (visible en Pedidos, sigue contando para el
  // límite de pedidos/mes) — evita que "corregir un número" en Gastos se
  // pueda usar para hacer desaparecer pedidos de plano y saltarse el límite.
  function eliminarVenta() {
    if (!borrandoVenta) return;
    const actual = getEmpleadoActual();
    update((prev) => {
      const f = prev.fonda!;
      return {
        ...prev,
        fonda: {
          ...f,
          pedidos: f.pedidos.map((p) =>
            p.id === borrandoVenta.id
              ? { ...p, estado: "cancelado" as const, canceladoPor: actual?.nombre ?? "Dueño", motivoCancelacion: "Corrección desde Gastos/Ventas" }
              : p
          ),
        },
      };
    });
    setBorrandoVenta(null);
  }

  // Editar/eliminar una venta de Abarrotes (items + recálculo de total,
  // ver VentaForm) — antes vivía en Inventario > Ventas, se movió aquí
  // para que todo lo de "Ventas" quede en un solo lugar. El stock no se
  // ajusta automáticamente (mismo comportamiento de siempre).
  function abrirEditarVentaAbarrotes(id: string) {
    const venta = session!.abarrotes!.ventas.find((v) => v.id === id);
    if (venta) setEditandoVentaAbarrotes(venta);
  }
  function abrirBorrarVentaAbarrotes(id: string) {
    const venta = session!.abarrotes!.ventas.find((v) => v.id === id);
    if (venta) setBorrandoVentaAbarrotes(venta);
  }
  function eliminarVentaAbarrotes() {
    if (!borrandoVentaAbarrotes) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, ventas: a.ventas.filter((v) => v.id !== borrandoVentaAbarrotes.id) } };
    });
    setBorrandoVentaAbarrotes(null);
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
          {faltaCostoEnFonda && (
            <p className="mt-2 px-1 text-xs text-muted-foreground">Agrega costo a tus platillos para ver ganancia real (con mermas incluidas).</p>
          )}
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
            {faltaCostoEnFonda && (
              <p className="mt-1 text-xs text-muted-foreground">Agrega costo a tus platillos para ver ganancia real.</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 px-4 pt-4">
        <Tabs
          value={rango}
          onValueChange={(v) => setRango(v as RangoTiempo)}
          tabs={RANGO_TABS}
          disabledValues={
            (modulo === "abarrotes" ? plan.giroAbarrotes.grafica : plan.giroFonda.grafica) === "anual"
              ? undefined
              : new Set(["mensual", "anual"])
          }
        />
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
          <BloqueoPlan
            activo={rango === "semanal" || (modulo === "abarrotes" ? plan.giroAbarrotes.grafica : plan.giroFonda.grafica) === "anual"}
            texto="Gráfica mensual y anual disponible en Pro y Pro+"
          >
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
                // Antes Fondita no tenía costo por platillo, así que su
                // "ganancia real" era idéntica a ventas - gastos (línea sin
                // información nueva) y se omitía. Ahora que Dish.costo existe
                // (opcional), gananciaPorVenta ya resta el costo de los
                // platillos que sí lo tienen — se muestra igual que en
                // Abarrotes, pero solo en cuanto al menos un platillo tiene
                // costo puesto (si no, sería solo -gastos disfrazado de
                // "ganancia", el mismo número engañoso que ya evitamos arriba).
                gananciaLabel={modulo === "abarrotes" || algunPlatilloConCosto ? "Ganancia real" : undefined}
                emptyText="Sin ventas ni gastos en este periodo"
              />
            )}
          </BloqueoPlan>
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
                  {modulo === "abarrotes" && (
                    <PendingSaleStatus negocioId={session.business.id} fila={ventasPendientesPorId.get(v.id)} />
                  )}
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
                      aria-label="Quitar de ventas"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {modulo === "abarrotes" && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    {plan.giroAbarrotes.editor && (
                      <button
                        onClick={() => abrirEditarVentaAbarrotes(v.id)}
                        aria-label="Editar venta"
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {puedeBorrarVentas && (
                      <button
                        onClick={() => abrirBorrarVentaAbarrotes(v.id)}
                        aria-label="Eliminar venta"
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
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
                      aria-label="Quitar de ventas"
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
        title="Quitar de ventas"
        description={`El pedido de ${borrandoVenta?.clienteNombre ?? ""} por ${borrandoVenta ? formatMoney(borrandoVenta.total) : ""} dejará de contar en ventas/gráficas. El pedido no se borra: queda marcado como cancelado en Pedidos.`}
        onClose={() => setBorrandoVenta(null)}
        onConfirm={eliminarVenta}
      />

      <Sheet open={!!editandoVentaAbarrotes} onOpenChange={(o) => !o && setEditandoVentaAbarrotes(null)}>
        {editandoVentaAbarrotes && (
          <VentaForm venta={editandoVentaAbarrotes} onClose={() => setEditandoVentaAbarrotes(null)} update={update} />
        )}
      </Sheet>

      <ConfirmDialog
        open={!!borrandoVentaAbarrotes}
        title="Eliminar venta"
        description={`Se borrará esta venta por ${borrandoVentaAbarrotes ? formatMoney(borrandoVentaAbarrotes.total) : ""}. El stock no se ajusta automáticamente.`}
        onClose={() => setBorrandoVentaAbarrotes(null)}
        onConfirm={eliminarVentaAbarrotes}
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
