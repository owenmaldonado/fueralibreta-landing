"use client";

import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/dashboards/empty-state";
import { CobrarCitaDialog } from "@/components/dashboards/cobrar-cita-dialog";
import { LimiteBar } from "@/components/dashboards/limite-bar";
import { WhatsappRecordatorioButton } from "@/components/dashboards/whatsapp-recordatorio-button";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { formatHora12, formatMoney, todayISO, waLink } from "@/lib/mock";
import { getEmpleadoActual, camposEmpleado } from "@/lib/empleados";
import { encolarVentaPendiente, usePendingSalesQueue, type VentaPendienteRow } from "@/lib/offline-sales-queue";
import { PendingSaleStatus } from "@/components/app-shell/pending-sale-status";
import type { Appointment, BarberiaData } from "@/lib/types";

type Modo = "hoy" | "manana" | "semanal" | "fecha";

const MODO_TABS = [
  { value: "hoy", label: "Hoy" },
  { value: "manana", label: "Mañana" },
  { value: "semanal", label: "Semanal" },
  { value: "fecha", label: "Fecha" },
];

export default function AgendaPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [modo, setModo] = React.useState<Modo>("hoy");
  const [fecha, setFecha] = React.useState(todayISO(0));
  const [moviendo, setMoviendo] = React.useState<Appointment | null>(null);
  const [cobrando, setCobrando] = React.useState<Appointment | null>(null);
  const [cancelando, setCancelando] = React.useState<Appointment | null>(null);
  const [motivo, setMotivo] = React.useState("");

  const { rows: ventasPendientesRows } = usePendingSalesQueue(session?.business.id);
  const citasPendientesPorId = React.useMemo(
    () => new Map(ventasPendientesRows.filter((r) => r.tipo === "barberia_cobro_cita").map((r) => [r.id, r] as const)),
    [ventasPendientesRows]
  );

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  const negocioNombre = session.business.nombre;
  const negocioId = session.business.id;
  const mesActual = todayISO(0).slice(0, 7);
  const maxCitas = plan.giroBarberia.maxCitas;
  const citasDelMes = data.citas.filter((c) => c.fecha.startsWith(mesActual) && c.estado !== "cancelada").length;

  /** "Cancelar cita" siempre deja constancia de quién y por qué — mismo patrón que Pedidos (fonda). */
  function confirmarCancelacion() {
    if (!cancelando) return;
    const actual = getEmpleadoActual();
    update((prev) => {
      const b = prev.barberia!;
      return {
        ...prev,
        barberia: {
          ...b,
          citas: b.citas.map((c) =>
            c.id === cancelando.id
              ? { ...c, estado: "cancelada" as const, canceladoPor: actual?.nombre ?? "Dueño", motivoCancelacion: motivo.trim() || undefined }
              : c
          ),
        },
      };
    });
    setCancelando(null);
    setMotivo("");
  }

  function marcarListoConMetodo(id: string, metodo: "efectivo" | "transferencia") {
    let negocioId = "";
    update(
      (prev) => {
        const b = prev.barberia!;
        negocioId = prev.business.id;
        return {
          ...prev,
          barberia: {
            ...b,
            citas: b.citas.map((c) => (c.id === id ? { ...c, estado: "listo" as const, metodo, ...camposEmpleado() } : c)),
          },
        };
      },
      { ventaOffline: true }
    );
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      encolarVentaPendiente({
        id,
        negocioId,
        tipo: "barberia_cobro_cita",
        payload: { citaId: id, metodo },
        ...camposEmpleado(),
      }).catch((err) => console.error("No se pudo encolar la venta pendiente:", err));
    }
    setCobrando(null);
  }

  function mover(id: string, nuevaFecha: string, nuevaHora: string) {
    update((prev) => {
      const b = prev.barberia!;
      return {
        ...prev,
        barberia: { ...b, citas: b.citas.map((c) => (c.id === id ? { ...c, fecha: nuevaFecha, hora: nuevaHora } : c)) },
      };
    });
    setMoviendo(null);
  }

  const subtitle =
    modo === "hoy"
      ? "Hoy"
      : modo === "manana"
        ? "Mañana"
        : modo === "semanal"
          ? "Esta semana (lun-dom)"
          : new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });

  return (
    <>
      <PageHeader title="Agenda" subtitle={subtitle} />
      <LimiteBar actual={citasDelMes} max={maxCitas} etiqueta="citas este mes" planLabel={plan.label} />
      <div className="px-4 pb-3">
        <Tabs value={modo} onValueChange={(v) => setModo(v as Modo)} tabs={MODO_TABS} />
      </div>

      {modo === "fecha" && (
        <div className="px-4 pb-3">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-full border border-border bg-transparent px-4 py-2 text-sm text-muted-foreground"
          />
        </div>
      )}

      {modo === "semanal" ? (
        <SemanaView
          data={data}
          onCobrar={setCobrando}
          onMover={setMoviendo}
          onCancelar={setCancelando}
          negocioNombre={negocioNombre}
          negocioId={negocioId}
          pendientesPorId={citasPendientesPorId}
          msg28={plan.giroBarberia.msg28}
        />
      ) : (
        <DiaView
          data={data}
          fecha={modo === "hoy" ? todayISO(0) : modo === "manana" ? todayISO(1) : fecha}
          onCobrar={setCobrando}
          onMover={setMoviendo}
          onCancelar={setCancelando}
          negocioNombre={negocioNombre}
          negocioId={negocioId}
          pendientesPorId={citasPendientesPorId}
          msg28={plan.giroBarberia.msg28}
        />
      )}

      <MoverCitaSheet cita={moviendo} onClose={() => setMoviendo(null)} onGuardar={mover} />
      <CobrarCitaDialog cita={cobrando} onClose={() => setCobrando(null)} onConfirmar={marcarListoConMetodo} />

      <Dialog open={!!cancelando} onOpenChange={(o) => !o && setCancelando(null)}>
        <DialogHeader
          title="Cancelar cita"
          description={`${cancelando?.clienteNombre} · ${cancelando ? formatHora12(cancelando.hora) : ""}`}
          onClose={() => setCancelando(null)}
        />
        <Input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelando(null)}>
            Cerrar
          </Button>
          <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmarCancelacion}>
            Cancelar cita
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function DiaView({
  data,
  fecha,
  onCobrar,
  onMover,
  onCancelar,
  negocioNombre,
  negocioId,
  pendientesPorId,
  msg28,
}: {
  data: BarberiaData;
  fecha: string;
  onCobrar: (c: Appointment) => void;
  onMover: (c: Appointment) => void;
  onCancelar: (c: Appointment) => void;
  negocioNombre: string;
  negocioId: string;
  pendientesPorId: Map<string, VentaPendienteRow>;
  msg28: boolean;
}) {
  const citas = data.citas.filter((c) => c.fecha === fecha && c.estado !== "cancelada").sort((a, b) => a.hora.localeCompare(b.hora));

  return (
    <div className="flex flex-col gap-2 px-4 pb-6">
      {citas.length === 0 ? (
        <EmptyState texto="Sin citas para este día" />
      ) : (
        citas.map((c) => (
          <CitaRow
            key={c.id}
            cita={c}
            onCobrar={onCobrar}
            onMover={onMover}
            onCancelar={onCancelar}
            negocioNombre={negocioNombre}
            negocioId={negocioId}
            fila={pendientesPorId.get(c.id)}
            msg28={msg28}
          />
        ))
      )}
    </div>
  );
}

function SemanaView({
  data,
  onCobrar,
  onMover,
  onCancelar,
  negocioNombre,
  negocioId,
  pendientesPorId,
  msg28,
}: {
  data: BarberiaData;
  onCobrar: (c: Appointment) => void;
  onMover: (c: Appointment) => void;
  onCancelar: (c: Appointment) => void;
  negocioNombre: string;
  negocioId: string;
  pendientesPorId: Map<string, VentaPendienteRow>;
  msg28: boolean;
}) {
  // Lunes a domingo de la semana de calendario en curso (misma definición
  // que "Semanal" en la gráfica de Gastos/Caja), no un rolling de 7 días
  // desde hoy — así el lunes-miércoles ya pasados de esta semana no
  // desaparecen solo porque "hoy" cae a mitad de semana.
  const diasDesdeLunes = (new Date().getDay() + 6) % 7;
  const dias = Array.from({ length: 7 }, (_, i) => todayISO(i - diasDesdeLunes));
  const porDia = dias.map((fecha) => ({
    fecha,
    citas: data.citas.filter((c) => c.fecha === fecha && c.estado !== "cancelada").sort((a, b) => a.hora.localeCompare(b.hora)),
  }));
  const hayCitas = porDia.some((d) => d.citas.length > 0);

  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      {!hayCitas ? (
        <EmptyState texto="Sin citas esta semana" />
      ) : (
        porDia
          .filter((d) => d.citas.length > 0)
          .map((d) => (
            <div key={d.fecha}>
              <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {d.fecha === todayISO(0)
                  ? "Hoy"
                  : d.fecha === todayISO(1)
                    ? "Mañana"
                    : new Date(`${d.fecha}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" })}
              </p>
              <div className="flex flex-col gap-2">
                {d.citas.map((c) => (
                  <CitaRow
                    key={c.id}
                    cita={c}
                    onCobrar={onCobrar}
                    onMover={onMover}
                    onCancelar={onCancelar}
                    negocioNombre={negocioNombre}
                    negocioId={negocioId}
                    fila={pendientesPorId.get(c.id)}
                    msg28={msg28}
                  />
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  );
}

function CitaRow({
  cita: c,
  onCobrar,
  onMover,
  onCancelar,
  negocioNombre,
  negocioId,
  fila,
  msg28,
}: {
  cita: Appointment;
  onCobrar: (c: Appointment) => void;
  onMover: (c: Appointment) => void;
  onCancelar: (c: Appointment) => void;
  negocioNombre: string;
  negocioId: string;
  fila?: VentaPendienteRow;
  msg28: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="w-16 shrink-0 font-mono text-sm text-primary">{formatHora12(c.hora)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{c.clienteNombre}</p>
        <p className="text-xs text-muted-foreground">
          {c.servicioNombre} · {formatMoney(c.precio)}
        </p>
        <PendingSaleStatus negocioId={negocioId} fila={fila} />
      </div>
      {c.estado === "pendiente" ? (
        <Button size="sm" variant="ledger" onClick={() => onCobrar(c)}>
          ✔️ Listo
        </Button>
      ) : (
        <span className="shrink-0 font-mono text-xs uppercase tracking-widest text-ledger">Listo</span>
      )}
      <WhatsappRecordatorioButton cita={c} negocioNombre={negocioNombre} disponible={msg28} />
      <DropdownMenu
        items={[
          ...(c.clienteTelefono
            ? [
                {
                  label: "WhatsApp",
                  onClick: () =>
                    window.open(waLink(c.clienteTelefono, `Hola ${c.clienteNombre}, te confirmamos tu cita a las ${formatHora12(c.hora)}`), "_blank"),
                },
              ]
            : []),
          { label: "Mover cita", onClick: () => onMover(c) },
          { label: "Cancelar cita", danger: true, onClick: () => onCancelar(c) },
        ]}
      />
    </div>
  );
}

function MoverCitaSheet({
  cita,
  onClose,
  onGuardar,
}: {
  cita: Appointment | null;
  onClose: () => void;
  onGuardar: (id: string, fecha: string, hora: string) => void;
}) {
  const [fecha, setFecha] = React.useState("");
  const [hora, setHora] = React.useState("");

  React.useEffect(() => {
    if (cita) {
      setFecha(cita.fecha);
      setHora(cita.hora);
    }
  }, [cita]);

  return (
    <Sheet open={!!cita} onOpenChange={(o) => !o && onClose()}>
      {cita && (
        <>
          <SheetHeader title="Mover cita" description={`${cita.clienteNombre} · ${cita.servicioNombre}`} onClose={onClose} />
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <SheetFooter>
            <Button size="lg" disabled={!fecha || !hora} onClick={() => onGuardar(cita.id, fecha, hora)}>
              Guardar
            </Button>
          </SheetFooter>
        </>
      )}
    </Sheet>
  );
}
