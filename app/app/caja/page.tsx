"use client";

import * as React from "react";
import { Banknote, CreditCard, HandCoins, Receipt, Plus, Pencil, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmptyState } from "@/components/dashboards/empty-state";
import { TrendBarChart } from "@/components/dashboards/trend-bar-chart";
import { PlanGate } from "@/components/dashboards/plan-gate";
import { BloqueoPlan } from "@/components/dashboards/bloqueo-plan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { formatMoney, uid } from "@/lib/mock";
import { aggregateTwoByRange, type RangoTiempo } from "@/lib/chart-buckets";
import { camposEmpleado, permisosActuales } from "@/lib/empleados";
import { usePendingSalesQueue } from "@/lib/offline-sales-queue";
import { PendingSaleStatus } from "@/components/app-shell/pending-sale-status";
import { cn } from "@/lib/utils";
import type { CajaEntry } from "@/lib/types";

const ICONS = { venta: Banknote, propina: HandCoins, gasto: Receipt };

const RANGO_TABS = [
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

export default function CajaPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [addOpen, setAddOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<CajaEntry | null>(null);
  const [borrando, setBorrando] = React.useState<CajaEntry | null>(null);
  const [rango, setRango] = React.useState<RangoTiempo>("semanal");
  // Multiusuario: un rol "vendedor" no puede borrar movimientos de Caja.
  const [puedeBorrar, setPuedeBorrar] = React.useState(true);

  React.useEffect(() => {
    setPuedeBorrar(permisosActuales().borrarVentas);
  }, []);

  const { rows: ventasPendientesRows } = usePendingSalesQueue(session?.business.id);
  const movimientosPendientesPorId = React.useMemo(
    () => new Map(ventasPendientesRows.filter((r) => r.tipo === "barberia_caja").map((r) => [r.id, r] as const)),
    [ventasPendientesRows]
  );

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  // Los cortes marcados como "listo" en Agenda/Hoy también son ingresos —
  // viven en barberia_citas, no en barberia_caja, así que hay que sumarlos
  // aparte a Ingresos/Ganancia neta/Efectivo/Transferencia.
  const cortes = data.citas.filter((c) => c.estado === "listo");
  const totalCortes = cortes.reduce((acc, c) => acc + c.precio, 0);

  const ventas = data.caja.filter((e) => e.tipo === "venta").reduce((acc, e) => acc + e.monto, 0);
  const propinas = data.caja.filter((e) => e.tipo === "propina").reduce((acc, e) => acc + e.monto, 0);
  const ingresos = ventas + propinas + totalCortes;
  const gastos = data.caja.filter((e) => e.tipo === "gasto").reduce((acc, e) => acc + e.monto, 0);
  const gananciaNeta = ingresos - gastos;
  const efectivo =
    data.caja.filter((e) => e.tipo !== "gasto" && e.metodo === "efectivo").reduce((acc, e) => acc + e.monto, 0) +
    cortes.filter((c) => (c.metodo ?? "efectivo") === "efectivo").reduce((acc, c) => acc + c.precio, 0);
  const transferencia =
    data.caja.filter((e) => e.tipo !== "gasto" && e.metodo === "transferencia").reduce((acc, e) => acc + e.monto, 0) +
    cortes.filter((c) => c.metodo === "transferencia").reduce((acc, c) => acc + c.precio, 0);

  const movimientos = [...data.caja].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const movsParaGrafica: { fecha: string; a: number; b: number }[] = [
    ...data.caja.map((m) => (m.tipo === "gasto" ? { fecha: m.fecha, a: 0, b: m.monto } : { fecha: m.fecha, a: m.monto, b: 0 })),
    ...cortes.map((c) => ({ fecha: `${c.fecha}T${c.hora}`, a: c.precio, b: 0 })),
  ];
  const serie = aggregateTwoByRange(
    movsParaGrafica,
    rango,
    (m) => m.fecha,
    (m) => ({ a: m.a, b: m.b })
  );

  function eliminar() {
    if (!borrando) return;
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, caja: b.caja.filter((m) => m.id !== borrando.id) } };
    });
    setBorrando(null);
  }

  return (
    <>
      <PageHeader
        title="Caja"
        subtitle="Ventas, propinas y gastos"
        action={
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-2 px-4">
        <StatTile label="Ingresos" value={formatMoney(ingresos)} />
        <StatTile label="Gastos" value={formatMoney(gastos)} />
        <StatTile label="Ganancia neta" value={formatMoney(gananciaNeta)} />
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pt-3">
        <StatTile label="Efectivo" value={formatMoney(efectivo)} />
        <StatTile label="Transferencia" value={formatMoney(transferencia)} />
      </div>

      <div className="flex flex-col gap-3 px-4 pt-4">
        <Tabs
          value={rango}
          onValueChange={(v) => setRango(v as RangoTiempo)}
          tabs={RANGO_TABS}
          // Mismo criterio que /app/gastos (abarrotes/fonda): básico
          // ("ventas") solo navega Semanal, Mensual/Anual quedan con
          // candado hasta Pro/Pro+ ("completa"). Antes solo se restringía
          // qué barras se veían, no el rango — se podía picar Mensual/Anual
          // libremente aunque el plan fuera básico.
          disabledValues={plan.giroBarberia.grafica === "completa" ? undefined : new Set(["mensual", "anual"])}
        />
        <PlanGate feature="graficas">
          <BloqueoPlan
            activo={rango === "semanal" || plan.giroBarberia.grafica === "completa"}
            texto="Gráfica mensual y anual disponible en Pro y Pro+"
          >
            <TrendBarChart
              data={serie.map((s) => ({ label: s.label, ingreso: s.a, gasto: s.b }))}
              // grafica "ventas" (básico) solo ve la barra de ingresos — la de
              // gastos, junto a Ganancia neta/Efectivo/Transferencia arriba,
              // es la vista "completa" de Pro/Pro+ (ver LIMITES_BARBERIA).
              bars={
                plan.giroBarberia.grafica === "completa"
                  ? [
                      { key: "ingreso", name: "Ingresos", color: "hsl(168 55% 45%)" },
                      { key: "gasto", name: "Gastos", color: "hsl(4 78% 58%)" },
                    ]
                  : [{ key: "ingreso", name: "Ingresos", color: "hsl(168 55% 45%)" }]
              }
              emptyText="Sin movimientos en este periodo"
            />
          </BloqueoPlan>
        </PlanGate>
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
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {new Date(m.fecha).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    <CreditCard className="hidden h-3 w-3" />
                    · {m.metodo === "efectivo" ? "Efectivo" : "Transferencia"}
                  </p>
                  <PendingSaleStatus negocioId={session.business.id} fila={movimientosPendientesPorId.get(m.id)} />
                </div>
                <span className={cn("shrink-0 font-mono text-sm", m.tipo === "gasto" ? "text-destructive" : "text-foreground")}>
                  {m.tipo === "gasto" ? "-" : "+"}
                  {formatMoney(m.monto)}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => setEditando(m)}
                    aria-label="Editar movimiento"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {puedeBorrar && (
                    <button
                      onClick={() => setBorrando(m)}
                      aria-label="Eliminar movimiento"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <CajaForm onClose={() => setAddOpen(false)} update={update} />
      </Sheet>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <CajaForm entry={editando} onClose={() => setEditando(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar movimiento"
        description={`Se borrará "${borrando?.concepto}" por ${borrando ? formatMoney(borrando.monto) : ""}.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminar}
      />
    </>
  );
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CajaForm({
  entry,
  onClose,
  update,
}: {
  entry?: CajaEntry;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [tipo, setTipo] = React.useState<CajaEntry["tipo"]>(entry?.tipo ?? "venta");
  const [concepto, setConcepto] = React.useState(entry?.concepto ?? "Corte");
  const [monto, setMonto] = React.useState(String(entry?.monto ?? ""));
  const [metodo, setMetodo] = React.useState<CajaEntry["metodo"]>(entry?.metodo ?? "efectivo");
  const [fecha, setFecha] = React.useState(entry ? toDatetimeLocal(entry.fecha) : toDatetimeLocal(new Date().toISOString()));

  const puedeGuardar = Number(monto) > 0 && concepto.trim().length > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const b = prev.barberia!;
      const datos = { tipo, concepto: concepto.trim(), monto: Number(monto), metodo, fecha };
      if (entry) {
        return { ...prev, barberia: { ...b, caja: b.caja.map((m) => (m.id === entry.id ? { ...m, ...datos } : m)) } };
      }
      const nuevo: CajaEntry = { id: uid("caja"), ...datos, ...camposEmpleado() };
      return { ...prev, barberia: { ...b, caja: [nuevo, ...b.caja] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title={entry ? "Editar movimiento" : "Nuevo movimiento"} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <ChipGroup>
            <Chip selected={tipo === "venta"} onClick={() => setTipo("venta")}>
              Venta
            </Chip>
            <Chip selected={tipo === "propina"} onClick={() => setTipo("propina")}>
              Propina
            </Chip>
            <Chip selected={tipo === "gasto"} onClick={() => setTipo("gasto")} tone="danger">
              Gasto
            </Chip>
          </ChipGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Concepto</Label>
          <Input autoFocus value={concepto} onChange={(e) => setConcepto(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Monto</Label>
          <Input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0" />
        </div>
        <div className="space-y-1.5">
          <Label>Método</Label>
          <ChipGroup>
            <Chip selected={metodo === "efectivo"} onClick={() => setMetodo("efectivo")}>
              Efectivo
            </Chip>
            <Chip selected={metodo === "transferencia"} onClick={() => setMetodo("transferencia")}>
              Transferencia
            </Chip>
          </ChipGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Fecha y hora</Label>
          <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          {entry ? "Guardar cambios" : "Guardar"}
        </Button>
      </SheetFooter>
    </>
  );
}
