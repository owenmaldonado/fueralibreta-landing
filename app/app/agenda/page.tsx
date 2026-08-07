"use client";

import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { formatMoney, todayISO, waLink } from "@/lib/mock";
import type { Appointment, AppointmentStatus, BarberiaData } from "@/lib/types";

/**
 * "Hola {nombre}! Te esperamos en tu cita de {servicio} hoy a las {hora} en
 * {nombre_barberia}. ¡Nos vemos pronto! ✨" — con una diferencia: si la cita
 * NO es hoy, dice la fecha en vez de "hoy" (un recordatorio real puede
 * mandarse un día antes, y decir "hoy" para una cita de mañana confundiría).
 */
function mensajeRecordatorio(c: Appointment, negocioNombre: string): string {
  const cuando =
    c.fecha === todayISO(0)
      ? "hoy"
      : `el ${new Date(`${c.fecha}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`;
  return `Hola ${c.clienteNombre}! Te esperamos en tu cita de ${c.servicioNombre} ${cuando} a las ${c.hora} en ${negocioNombre}. ¡Nos vemos pronto! ✨`;
}

type Modo = "hoy" | "manana" | "semanal" | "fecha";

const MODO_TABS = [
  { value: "hoy", label: "Hoy" },
  { value: "manana", label: "Mañana" },
  { value: "semanal", label: "Semanal" },
  { value: "fecha", label: "Fecha" },
];

export default function AgendaPage() {
  const { session, ready, update } = useSession();
  const [modo, setModo] = React.useState<Modo>("hoy");
  const [fecha, setFecha] = React.useState(todayISO(0));
  const [moviendo, setMoviendo] = React.useState<Appointment | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  const negocioNombre = session.business.nombre;

  function marcar(id: string, estado: AppointmentStatus) {
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, citas: b.citas.map((c) => (c.id === id ? { ...c, estado } : c)) } };
    });
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
          ? "Próximos 7 días"
          : new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });

  return (
    <>
      <PageHeader title="Agenda" subtitle={subtitle} />
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
        <SemanaView data={data} onMarcar={marcar} onMover={setMoviendo} negocioNombre={negocioNombre} />
      ) : (
        <DiaView
          data={data}
          fecha={modo === "hoy" ? todayISO(0) : modo === "manana" ? todayISO(1) : fecha}
          onMarcar={marcar}
          onMover={setMoviendo}
          negocioNombre={negocioNombre}
        />
      )}

      <MoverCitaSheet cita={moviendo} onClose={() => setMoviendo(null)} onGuardar={mover} />
    </>
  );
}

function DiaView({
  data,
  fecha,
  onMarcar,
  onMover,
  negocioNombre,
}: {
  data: BarberiaData;
  fecha: string;
  onMarcar: (id: string, estado: AppointmentStatus) => void;
  onMover: (c: Appointment) => void;
  negocioNombre: string;
}) {
  const citas = data.citas.filter((c) => c.fecha === fecha && c.estado !== "cancelada").sort((a, b) => a.hora.localeCompare(b.hora));

  return (
    <div className="flex flex-col gap-2 px-4 pb-6">
      {citas.length === 0 ? (
        <EmptyState texto="Sin citas para este día" />
      ) : (
        citas.map((c) => <CitaRow key={c.id} cita={c} onMarcar={onMarcar} onMover={onMover} negocioNombre={negocioNombre} />)
      )}
    </div>
  );
}

function SemanaView({
  data,
  onMarcar,
  onMover,
  negocioNombre,
}: {
  data: BarberiaData;
  onMarcar: (id: string, estado: AppointmentStatus) => void;
  onMover: (c: Appointment) => void;
  negocioNombre: string;
}) {
  const dias = Array.from({ length: 7 }, (_, i) => todayISO(i));
  const porDia = dias.map((fecha) => ({
    fecha,
    citas: data.citas.filter((c) => c.fecha === fecha && c.estado !== "cancelada").sort((a, b) => a.hora.localeCompare(b.hora)),
  }));
  const hayCitas = porDia.some((d) => d.citas.length > 0);

  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      {!hayCitas ? (
        <EmptyState texto="Sin citas en los próximos 7 días" />
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
                  <CitaRow key={c.id} cita={c} onMarcar={onMarcar} onMover={onMover} negocioNombre={negocioNombre} />
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
  onMarcar,
  onMover,
  negocioNombre,
}: {
  cita: Appointment;
  onMarcar: (id: string, estado: AppointmentStatus) => void;
  onMover: (c: Appointment) => void;
  negocioNombre: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="w-14 shrink-0 font-mono text-sm text-primary">{c.hora}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{c.clienteNombre}</p>
        <p className="text-xs text-muted-foreground">
          {c.servicioNombre} · {formatMoney(c.precio)}
        </p>
      </div>
      {c.estado === "pendiente" ? (
        <Button size="sm" variant="ledger" onClick={() => onMarcar(c.id, "listo")}>
          ✔️ Listo
        </Button>
      ) : (
        <span className="shrink-0 font-mono text-xs uppercase tracking-widest text-ledger">Listo</span>
      )}
      <DropdownMenu
        items={[
          ...(c.clienteTelefono
            ? [
                {
                  label: "WhatsApp",
                  onClick: () =>
                    window.open(waLink(c.clienteTelefono, `Hola ${c.clienteNombre}, te confirmamos tu cita a las ${c.hora}`), "_blank"),
                },
                {
                  label: "Enviar recordatorio",
                  onClick: () => window.open(waLink(c.clienteTelefono, mensajeRecordatorio(c, negocioNombre)), "_blank"),
                },
              ]
            : []),
          { label: "Mover cita", onClick: () => onMover(c) },
          { label: "Cancelar cita", danger: true, onClick: () => onMarcar(c.id, "cancelada") },
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
