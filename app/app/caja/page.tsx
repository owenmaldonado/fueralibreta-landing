"use client";

import * as React from "react";
import { Banknote, CreditCard, HandCoins, Receipt, Scissors, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { EmpleadoBadge } from "@/components/dashboards/empleado-badge";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { insertCajaEntryDirecto, updateCajaEntryDirecto, deleteCajaEntryDirecto } from "@/lib/data";
import { formatMoney, uid } from "@/lib/mock";
import { hoyEnZona } from "@/lib/fecha";
import { VentaRapidaSheet, VentaRapidaBoton } from "@/components/dashboards/barberia-venta-rapida";
import { aggregateTwoByRange, type RangoTiempo } from "@/lib/chart-buckets";
import { camposEmpleado, permisosActuales, ROL_LABEL } from "@/lib/empleados";
import { usePendingSalesQueue, encolarVentaPendiente } from "@/lib/offline-sales-queue";
import { PendingSaleStatus } from "@/components/app-shell/pending-sale-status";
import { cn } from "@/lib/utils";
import type { CajaEntry, RolEmpleado } from "@/lib/types";

/** Valor de personaFiltro para "sin empleado_nombre_cache" — un movimiento hecho por el dueño directo, sin pasar por el kiosko. */
const PERSONA_DUENO = "__dueno__";

const ICONS = { venta: Banknote, propina: HandCoins, gasto: Receipt, corte: Scissors };

const RANGO_TABS = [
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

export default function CajaPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [addOpen, setAddOpen] = React.useState(false);
  const [ventaRapidaOpen, setVentaRapidaOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<CajaEntry | null>(null);
  const [borrando, setBorrando] = React.useState<CajaEntry | null>(null);
  const [rango, setRango] = React.useState<RangoTiempo>("semanal");
  // Multiusuario: un rol "vendedor" no puede borrar movimientos de Caja.
  const [puedeBorrar, setPuedeBorrar] = React.useState(true);
  // Trazabilidad vendedor/encargado (PR #121) — mismo patrón que
  // app/app/gastos/page.tsx: filtro frontend puro, acota data.caja/cortes
  // ANTES de que alimenten totales, gráfica y lista.
  const [personaFiltro, setPersonaFiltro] = React.useState<string>("todos");

  React.useEffect(() => {
    setPuedeBorrar(permisosActuales().borrarVentas);
  }, []);

  const { rows: ventasPendientesRows } = usePendingSalesQueue(session?.business.id);
  // Los tres tipos de venta de barbería que pueden quedar en la cola. Antes
  // solo se miraba barberia_caja, así que un cobro de cita o una venta
  // rápida rechazados por el servidor salían en el badge del header como
  // "por revisar" pero no tenían NINGUNA pantalla donde reintentarlos o
  // descartarlos — quedaban ahí para siempre. La cola usa el id de la cita
  // como id de la fila, que es el mismo id con el que se pinta el corte en
  // esta lista.
  const movimientosPendientesPorId = React.useMemo(
    () =>
      new Map(
        ventasPendientesRows
          .filter((r) => r.tipo === "barberia_caja" || r.tipo === "barberia_cobro_cita" || r.tipo === "barberia_venta_rapida")
          .map((r) => [r.id, r] as const)
      ),
    [ventasPendientesRows]
  );

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  // Los cortes marcados como "listo" en Agenda/Hoy también son ingresos —
  // viven en barberia_citas, no en barberia_caja, así que hay que sumarlos
  // aparte a Ingresos/Ganancia neta/Efectivo/Transferencia.
  const cortesSinFiltroPersona = data.citas.filter((c) => c.estado === "listo");

  // Roster de personas para los chips (PR #121, trazabilidad vendedor/
  // encargado) — del universo completo, antes de aplicar personaFiltro.
  // Se agrupa por empleado_id, NO por el nombre cacheado: dos filas del
  // mismo empleado pueden traer el nombre cacheado con distinta
  // capitalización si negocio_empleados llegó a tener un duplicado tipo
  // "Maria"/"maria" (bug real, ver migración de negocio_empleados) —
  // agrupando por nombre esa persona se partía en dos chips distintos y
  // cada uno mostraba solo una mitad de sus movimientos. empleado_id es
  // estable aunque el nombre cambie o esté mal capitalizado.
  const nombrePorPersona = new Map<string, string>();
  const rolPorPersona = new Map<string, RolEmpleado>();
  let hayMovimientosDeDueno = false;
  for (const m of [...data.caja, ...cortesSinFiltroPersona]) {
    if (m.empleadoId) {
      if (!nombrePorPersona.has(m.empleadoId)) nombrePorPersona.set(m.empleadoId, m.empleadoNombreCache ?? "");
      rolPorPersona.set(m.empleadoId, m.empleadoRolCache ?? "vendedor");
    } else {
      hayMovimientosDeDueno = true;
    }
  }
  const personasDisponibles = Array.from(nombrePorPersona, ([id, nombre]) => ({ id, nombre })).sort((a, b) =>
    a.nombre.localeCompare(b.nombre)
  );
  const hayEquipo = personasDisponibles.length > 0;

  function coincidePersona(empleadoId?: string): boolean {
    if (personaFiltro === "todos") return true;
    if (personaFiltro === PERSONA_DUENO) return !empleadoId;
    return empleadoId === personaFiltro;
  }

  const cajaFiltrada = data.caja.filter((e) => coincidePersona(e.empleadoId));
  const cortes = cortesSinFiltroPersona.filter((c) => coincidePersona(c.empleadoId));
  const totalCortes = cortes.reduce((acc, c) => acc + c.precio, 0);

  const ventas = cajaFiltrada.filter((e) => e.tipo === "venta").reduce((acc, e) => acc + e.monto, 0);
  const propinas = cajaFiltrada.filter((e) => e.tipo === "propina").reduce((acc, e) => acc + e.monto, 0);
  const ingresos = ventas + propinas + totalCortes;
  const gastos = cajaFiltrada.filter((e) => e.tipo === "gasto").reduce((acc, e) => acc + e.monto, 0);
  // Lo que costó la mercancía vendida (gel, cera...) — snapshot guardado en
  // cada venta de producto, ver CajaEntry.costo. Sin restarlo, vender un
  // producto de $200 que costó $180 se veía como $200 de ganancia. Un corte
  // (servicio) no trae costo y sigue aportando margen completo, igual que
  // antes; las ventas de antes de este campo tampoco traen costo, así que
  // el histórico no cambia.
  const costoMercancia = cajaFiltrada.filter((e) => e.tipo === "venta").reduce((acc, e) => acc + (e.costo ?? 0), 0);
  const gananciaNeta = ingresos - gastos - costoMercancia;
  const efectivo =
    cajaFiltrada.filter((e) => e.tipo !== "gasto" && e.metodo === "efectivo").reduce((acc, e) => acc + e.monto, 0) +
    cortes.filter((c) => (c.metodo ?? "efectivo") === "efectivo").reduce((acc, c) => acc + c.precio, 0);
  const transferencia =
    cajaFiltrada.filter((e) => e.tipo !== "gasto" && e.metodo === "transferencia").reduce((acc, e) => acc + e.monto, 0) +
    cortes.filter((c) => c.metodo === "transferencia").reduce((acc, c) => acc + c.precio, 0);

  // Antes esta lista solo traía cajaFiltrada (movimientos manuales de
  // barberia_caja: venta/propina/gasto) — los cortes cobrados en Agenda/Hoy
  // (citas con estado "listo") sí sumaban en Ingresos/Efectivo/la gráfica
  // de arriba, pero nunca aparecían aquí abajo. Resultado: la gráfica podía
  // decir "$169 Ingresos" con un solo corte de $120 + una venta manual de
  // $49, pero Movimientos solo mostraba esa venta de $49 — parecía que la
  // suma estaba mal cuando en realidad solo faltaba la mitad de la lista.
  // Cada corte se pinta con el servicio + cliente (ej. "Corte de pelo ·
  // Juan"), sin botones de editar/borrar — eso se hace desde Agenda
  // (Mover/Cancelar cita), no desde aquí.
  interface MovimientoVisual {
    id: string;
    tipo: CajaEntry["tipo"] | "corte";
    concepto: string;
    monto: number;
    fecha: string;
    metodo: CajaEntry["metodo"] | undefined;
    empleadoNombreCache?: string;
    empleadoRolCache?: RolEmpleado;
  }
  const movimientos: MovimientoVisual[] = [
    ...cajaFiltrada.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      concepto: m.concepto,
      monto: m.monto,
      fecha: m.fecha,
      metodo: m.metodo,
      empleadoNombreCache: m.empleadoNombreCache,
      empleadoRolCache: m.empleadoRolCache,
    })),
    ...cortes.map((c) => ({
      id: c.id,
      tipo: "corte" as const,
      concepto: c.clienteNombre ? `${c.servicioNombre} · ${c.clienteNombre}` : c.servicioNombre,
      monto: c.precio,
      fecha: `${c.fecha}T${c.hora}`,
      metodo: c.metodo,
      empleadoNombreCache: c.empleadoNombreCache,
      empleadoRolCache: c.empleadoRolCache,
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const movsParaGrafica: { fecha: string; a: number; b: number }[] = [
    ...cajaFiltrada.map((m) => (m.tipo === "gasto" ? { fecha: m.fecha, a: 0, b: m.monto } : { fecha: m.fecha, a: m.monto, b: 0 })),
    ...cortes.map((c) => ({ fecha: `${c.fecha}T${c.hora}`, a: c.precio, b: 0 })),
  ];
  const serie = aggregateTwoByRange(
    movsParaGrafica,
    rango,
    (m) => m.fecha,
    (m) => ({ a: m.a, b: m.b })
  );

  async function eliminar() {
    if (!borrando) return;
    // Un gasto es dinero real: se espera la confirmación del DELETE en
    // Supabase antes de quitarlo de la lista local (ver bug crítico
    // "gastos no se guardan al refrescar" — mismo criterio que
    // app/app/gastos/page.tsx). Venta/propina siguen el flujo optimista
    // normal, que ya tiene su propio manejo offline (usePendingSalesQueue).
    if (borrando.tipo === "gasto") {
      try {
        await deleteCajaEntryDirecto(borrando.id);
      } catch {
        toast.error("No se pudo eliminar el gasto — revisa tu conexión e intenta de nuevo.");
        return;
      }
    }
    update(
      (prev) => {
        const b = prev.barberia!;
        return { ...prev, barberia: { ...b, caja: b.caja.filter((m) => m.id !== borrando.id) } };
      },
      { yaSincronizado: borrando.tipo === "gasto" }
    );
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
      {hayEquipo && (
        <div className="px-4">
          <ChipGroup>
            <Chip selected={personaFiltro === "todos"} onClick={() => setPersonaFiltro("todos")}>
              Todos
            </Chip>
            {hayMovimientosDeDueno && (
              <Chip selected={personaFiltro === PERSONA_DUENO} onClick={() => setPersonaFiltro(PERSONA_DUENO)}>
                Dueño
              </Chip>
            )}
            {personasDisponibles.map(({ id, nombre }) => (
              <Chip key={id} selected={personaFiltro === id} onClick={() => setPersonaFiltro(id)}>
                {nombre} · {ROL_LABEL[rolPorPersona.get(id)!]}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      )}
      {/* Mismo botón que en Hoy: Caja es la pantalla de dinero, es el otro
          lugar donde el barbero busca cobrar un walk-in. */}
      <div className="px-4 pt-3">
        <VentaRapidaBoton onClick={() => setVentaRapidaOpen(true)} />
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pt-3">
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
              // Ingresos + Gastos siempre las 2, sin importar el plan — antes
              // básico ("ventas") solo veía Ingresos, así que la gráfica no
              // cuadraba con los stat tiles de arriba (que sí sumaban ambos)
              // ni con Movimientos (que sí lista gastos). Mismo criterio que
              // /app/gastos (fonda/abarrotes): el plan limita el RANGO
              // (Semanal vs Mensual/Anual, ver disabledValues arriba), nunca
              // qué series se pintan.
              bars={[
                { key: "ingreso", name: "Ingresos", color: "hsl(168 55% 45%)" },
                { key: "gasto", name: "Gastos", color: "hsl(4 78% 58%)" },
              ]}
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
            const esCorte = m.tipo === "corte";
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
                  <div className="mt-1">
                    <EmpleadoBadge nombre={m.empleadoNombreCache} rol={m.empleadoRolCache} />
                  </div>
                </div>
                <span className={cn("shrink-0 font-mono text-sm", m.tipo === "gasto" ? "text-destructive" : "text-foreground")}>
                  {m.tipo === "gasto" ? "-" : "+"}
                  {formatMoney(m.monto)}
                </span>
                {/* Un corte se edita/cancela desde Agenda (Mover/Cancelar cita), no desde aquí. */}
                {!esCorte && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => {
                        const entry = cajaFiltrada.find((e) => e.id === m.id);
                        if (entry) setEditando(entry);
                      }}
                      aria-label="Editar movimiento"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {puedeBorrar && (
                      <button
                        onClick={() => {
                          const entry = cajaFiltrada.find((e) => e.id === m.id);
                          if (entry) setBorrando(entry);
                        }}
                        aria-label="Eliminar movimiento"
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <CajaForm negocioId={session.business.id} onClose={() => setAddOpen(false)} update={update} />
      </Sheet>

      <VentaRapidaSheet
        open={ventaRapidaOpen}
        onClose={() => setVentaRapidaOpen(false)}
        session={session}
        update={update}
        hoy={hoyEnZona(session.business.timezone)}
      />

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <CajaForm negocioId={session.business.id} entry={editando} onClose={() => setEditando(null)} update={update} />}
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
  negocioId,
  onClose,
  update,
}: {
  entry?: CajaEntry;
  negocioId: string;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [tipo, setTipo] = React.useState<CajaEntry["tipo"]>(entry?.tipo ?? "venta");
  const [concepto, setConcepto] = React.useState(entry?.concepto ?? "Corte");
  const [monto, setMonto] = React.useState(String(entry?.monto ?? ""));
  const [metodo, setMetodo] = React.useState<CajaEntry["metodo"]>(entry?.metodo ?? "efectivo");
  const [fecha, setFecha] = React.useState(entry ? toDatetimeLocal(entry.fecha) : toDatetimeLocal(new Date().toISOString()));
  const [guardando, setGuardando] = React.useState(false);

  const puedeGuardar = Number(monto) > 0 && concepto.trim().length > 0;

  async function guardar() {
    if (!puedeGuardar) return;
    // El <input type="datetime-local"> entrega "2026-08-27T00:30", una hora
    // SIN zona. Guardada tal cual en barberia_caja.fecha (timestamptz),
    // Postgres la interpretaba como UTC: un movimiento de las 00:30 en
    // México se guardaba como 00:30Z y al releerlo con fechaCalendarioLocal
    // caía a las 18:30 del DÍA ANTERIOR. new Date() la lee en la zona del
    // navegador — la misma que usó toDatetimeLocal para pintarla — así que
    // el viaje de ida y vuelta queda parejo. El otro CajaForm (el del FAB,
    // components/quick-add/barberia-quick-add.tsx) ya guardaba ISO con Z;
    // esta pantalla era la única que no.
    const instante = new Date(fecha);
    const fechaISO = isNaN(instante.getTime()) ? new Date().toISOString() : instante.toISOString();
    const datos = { tipo, concepto: concepto.trim(), monto: Number(monto), metodo, fecha: fechaISO };

    // Un gasto es dinero real: se espera la confirmación de Supabase antes
    // de tocar el estado local — venta/propina siguen el flujo optimista
    // normal (ya cubierto por usePendingSalesQueue para ventas sin red).
    if (tipo === "gasto") {
      setGuardando(true);
      const actualizado: CajaEntry = entry ? { ...entry, ...datos } : { id: uid("caja"), ...datos, ...camposEmpleado() };
      try {
        if (entry) {
          await updateCajaEntryDirecto(negocioId, actualizado);
        } else {
          await insertCajaEntryDirecto(negocioId, actualizado);
        }
      } catch {
        toast.error("No se pudo guardar el gasto — revisa tu conexión e intenta de nuevo.");
        setGuardando(false);
        return;
      }
      setGuardando(false);
      update(
        (prev) => {
          const b = prev.barberia!;
          if (entry) {
            return { ...prev, barberia: { ...b, caja: b.caja.map((m) => (m.id === entry.id ? actualizado : m)) } };
          }
          return { ...prev, barberia: { ...b, caja: [actualizado, ...b.caja] } };
        },
        { yaSincronizado: true }
      );
      onClose();
      return;
    }

    // Cobrar aquí (venta o propina) es EL flujo de venta de la barbería, no
    // administración: sin ventaOffline el guardia de update() lo rechazaba
    // sin señal con "solo puedes seguir vendiendo" — justo mientras se
    // intentaba vender. Editar un movimiento que ya existe sí es
    // administración y se queda bloqueado (no se marca).
    const esNuevoIngreso = !entry;
    const nuevo: CajaEntry | null = esNuevoIngreso ? { id: uid("caja"), ...datos, ...camposEmpleado() } : null;
    update(
      (prev) => {
        const b = prev.barberia!;
        if (entry) {
          return { ...prev, barberia: { ...b, caja: b.caja.map((m) => (m.id === entry.id ? { ...m, ...datos } : m)) } };
        }
        return { ...prev, barberia: { ...b, caja: [nuevo!, ...b.caja] } };
      },
      esNuevoIngreso ? { ventaOffline: true } : undefined
    );
    if (esNuevoIngreso && nuevo && typeof navigator !== "undefined" && !navigator.onLine) {
      encolarVentaPendiente({
        id: nuevo.id,
        negocioId,
        tipo: "barberia_caja",
        payload: nuevo,
        ...camposEmpleado(),
      }).catch((err) => console.error("No se pudo encolar la venta pendiente:", err));
    }
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
        <Button size="lg" disabled={!puedeGuardar || guardando} onClick={guardar}>
          {guardando ? "Guardando..." : entry ? "Guardar cambios" : "Guardar"}
        </Button>
      </SheetFooter>
    </>
  );
}
