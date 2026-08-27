"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { EmptyState } from "@/components/dashboards/empty-state";
import { CobrarCitaDialog } from "@/components/dashboards/cobrar-cita-dialog";
import { LimiteBar } from "@/components/dashboards/limite-bar";
import { WhatsappRecordatorioButton } from "@/components/dashboards/whatsapp-recordatorio-button";
import { EmpleadoBadge } from "@/components/dashboards/empleado-badge";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { addDays, formatHora12, formatMoney, todayISO, toISODate, waLink } from "@/lib/mock";
import { getDaySlots, getAvailableSlotsForDuracion, diaCodigoDeFecha } from "@/lib/agenda";
import { getEmpleadoActual, camposEmpleado } from "@/lib/empleados";
import { encolarVentaPendiente, usePendingSalesQueue, type VentaPendienteRow } from "@/lib/offline-sales-queue";
import { PendingSaleStatus } from "@/components/app-shell/pending-sale-status";
import type { Appointment, BarberiaData } from "@/lib/types";
import { useHoy } from "@/lib/use-hoy";

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
  // Día del negocio, reactivo a su medianoche (ver lib/use-hoy.ts) — la
  // Agenda es la pantalla que más se queda abierta en la barbería.
  const hoy = useHoy(session?.business.timezone);
  const [modo, setModo] = React.useState<Modo>("hoy");
  const [fecha, setFecha] = React.useState(todayISO(0));
  // "Fecha" empieza SIEMPRE mostrando todas las próximas citas (hoy en
  // adelante) — antes arrancaba en un solo día (el de `fecha`, normalmente
  // hoy), así que una cita agendada para dentro de 15 días era invisible
  // hasta picar esa fecha exacta a mano, uno por uno. Se vuelve a poner en
  // false cada vez que se entra a la pestaña — elegir un día puntual en el
  // input de fecha es una acción explícita de "quiero ver solo ESTE día".
  const [fechaFiltroActiva, setFechaFiltroActiva] = React.useState(false);
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
  // Mes de la zona del NEGOCIO, no la del dispositivo — todayISO(0) usa los
  // getters locales del navegador, así que el último día del mes por la
  // noche (o el primero de madrugada) un celular en otra zona contaba las
  // citas contra el mes equivocado: la barra de límite del plan saltaba de
  // "98 de 100" a "3 de 100" y de regreso según qué dispositivo la mirara.
  const mesActual = hoy.slice(0, 7);
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

  // Semanal usaba SIEMPRE la semana de calendario de new Date() (la fecha
  // del dispositivo AHORA), sin importar qué día tuviera seleccionado la
  // pestaña "Fecha" — agendar una cita para el lunes de la semana que
  // sigue y cambiar a Semanal nunca la mostraba (no era ningún bug de
  // guardado ni de realtime: la cita sí estaba ahí, la vista solo nunca
  // dejaba de mirar la semana de hoy). Ahora Semanal navega la semana que
  // contiene `fecha` — el mismo estado que ya usa la pestaña Fecha — así
  // que basta con pasar a Fecha, elegir el lunes en cuestión y volver a
  // Semanal para verla.
  const semanaInicio = inicioDeSemana(fecha);
  const semanaFin = toISODate(addDays(new Date(`${semanaInicio}T00:00:00`), 6));

  const subtitle =
    modo === "hoy"
      ? "Hoy"
      : modo === "manana"
        ? "Mañana"
        : modo === "semanal"
          ? `${new Date(`${semanaInicio}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" })} – ${new Date(`${semanaFin}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`
          : new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });

  return (
    <>
      <PageHeader title="Agenda" subtitle={subtitle} />
      <LimiteBar actual={citasDelMes} max={maxCitas} etiqueta="citas este mes" planLabel={plan.label} />
      <div className="px-4 pb-3">
        <Tabs
          value={modo}
          onValueChange={(v) => {
            setModo(v as Modo);
            if (v === "fecha") setFechaFiltroActiva(false);
          }}
          tabs={MODO_TABS}
        />
      </div>

      {modo === "fecha" && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <input
            type="date"
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
              setFechaFiltroActiva(true);
            }}
            className="rounded-full border border-border bg-transparent px-4 py-2 text-sm text-muted-foreground"
          />
          {fechaFiltroActiva && (
            <button
              type="button"
              onClick={() => setFechaFiltroActiva(false)}
              className="font-mono text-[10px] uppercase tracking-widest text-primary"
            >
              Ver todas las próximas
            </button>
          )}
        </div>
      )}

      {modo === "fecha" && !fechaFiltroActiva ? (
        <ProximasView
          hoy={hoy}
          data={data}
          onCobrar={setCobrando}
          onMover={setMoviendo}
          onCancelar={setCancelando}
          negocioNombre={negocioNombre}
          negocioId={negocioId}
          pendientesPorId={citasPendientesPorId}
          msg28={plan.giroBarberia.msg28}
        />
      ) : modo === "semanal" ? (
        <SemanaView
          hoy={hoy}
          data={data}
          fecha={fecha}
          onCambiarFecha={setFecha}
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
          fecha={modo === "hoy" ? hoy : modo === "manana" ? diaSiguiente(hoy) : fecha}
          onCobrar={setCobrando}
          onMover={setMoviendo}
          onCancelar={setCancelando}
          negocioNombre={negocioNombre}
          negocioId={negocioId}
          pendientesPorId={citasPendientesPorId}
          msg28={plan.giroBarberia.msg28}
        />
      )}

      <MoverCitaSheet cita={moviendo} data={data} timezone={session.business.timezone} onClose={() => setMoviendo(null)} onGuardar={mover} />
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

/**
 * Todas las citas de hoy en adelante, agrupadas por día — la pestaña
 * "Fecha" arranca aquí (ver fechaFiltroActiva en AgendaPage) para que una
 * cita dentro de 15 días no quede invisible hasta picar esa fecha exacta a
 * mano. Ya todo `data.citas` vive cargado en memoria (no hay paginación
 * real que hacer), así que "ver todas" es simplemente pintar la lista
 * completa en una sola página con scroll normal — no hace falta scroll
 * infinito de verdad.
 */
function ProximasView({
  hoy,
  data,
  onCobrar,
  onMover,
  onCancelar,
  negocioNombre,
  negocioId,
  pendientesPorId,
  msg28,
}: {
  hoy: string;
  data: BarberiaData;
  onCobrar: (c: Appointment) => void;
  onMover: (c: Appointment) => void;
  onCancelar: (c: Appointment) => void;
  negocioNombre: string;
  negocioId: string;
  pendientesPorId: Map<string, VentaPendienteRow>;
  msg28: boolean;
}) {
  // `hoy` llega por prop (día del NEGOCIO, ver useHoy en AgendaPage) en vez
  // de todayISO(0) — con la zona del dispositivo, un celular adelantado
  // filtraba fuera las citas de HOY (c.fecha >= hoy) y el barbero veía su
  // agenda del día vacía.
  const manana = diaSiguiente(hoy);
  const fechas = Array.from(new Set(data.citas.filter((c) => c.fecha >= hoy && c.estado !== "cancelada").map((c) => c.fecha))).sort();
  const porDia = fechas.map((fecha) => {
    const citas = data.citas.filter((c) => c.fecha === fecha && c.estado !== "cancelada").sort((a, b) => a.hora.localeCompare(b.hora));
    return {
      fecha,
      items: filaItems(citas, comidaDeFecha(data, fecha), { onCobrar, onMover, onCancelar, negocioNombre, negocioId, pendientesPorId, msg28 }),
    };
  });

  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      {porDia.length === 0 ? (
        <EmptyState texto="Sin citas próximas" />
      ) : (
        porDia.map((d) => (
          <div key={d.fecha}>
            <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {d.fecha === hoy
                ? "Hoy"
                : d.fecha === manana
                  ? "Mañana"
                  : new Date(`${d.fecha}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" })}
            </p>
            <div className="flex flex-col gap-2">{d.items.map((it) => it.node)}</div>
          </div>
        ))
      )}
    </div>
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
  const items = filaItems(citas, comidaDeFecha(data, fecha), {
    onCobrar,
    onMover,
    onCancelar,
    negocioNombre,
    negocioId,
    pendientesPorId,
    msg28,
  });

  return (
    <div className="flex flex-col gap-2 px-4 pb-6">
      {items.length === 0 ? <EmptyState texto="Sin citas para este día" /> : items.map((it) => it.node)}
    </div>
  );
}

/** Lunes (ISO) de la semana de calendario que contiene `fechaISO` — mismo criterio que "Semanal" en la gráfica de Caja/Gastos. */
/**
 * "Mañana" a partir de un día "YYYY-MM-DD" del negocio, por componentes —
 * no con addDays(new Date(fecha)), que reintroduce la zona del dispositivo
 * justo en el cálculo que estamos tratando de sacar de ahí.
 */
function diaSiguiente(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const sig = new Date(y, m - 1, d + 1);
  return `${sig.getFullYear()}-${String(sig.getMonth() + 1).padStart(2, "0")}-${String(sig.getDate()).padStart(2, "0")}`;
}

function inicioDeSemana(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  const diasDesdeLunes = (d.getDay() + 6) % 7;
  return toISODate(addDays(d, -diasDesdeLunes));
}

function SemanaView({
  hoy,
  data,
  fecha,
  onCambiarFecha,
  onCobrar,
  onMover,
  onCancelar,
  negocioNombre,
  negocioId,
  pendientesPorId,
  msg28,
}: {
  hoy: string;
  data: BarberiaData;
  /** Cualquier fecha dentro de la semana a mostrar — mismo estado que usa la pestaña "Fecha" (ver AgendaPage), así que elegir un día ahí y volver a Semanal muestra esa semana. */
  fecha: string;
  onCambiarFecha: (fecha: string) => void;
  onCobrar: (c: Appointment) => void;
  onMover: (c: Appointment) => void;
  onCancelar: (c: Appointment) => void;
  negocioNombre: string;
  negocioId: string;
  pendientesPorId: Map<string, VentaPendienteRow>;
  msg28: boolean;
}) {
  // Lunes a domingo de la semana que CONTIENE `fecha` — antes siempre era
  // la semana de new Date() (la fecha del dispositivo ahora mismo) sin
  // importar qué día estuviera seleccionado en la pestaña Fecha, así que
  // una cita agendada para la semana siguiente nunca se veía aquí aunque
  // sí se hubiera guardado bien. Los botones ‹ › mueven `fecha` 7 días
  // (misma prop que Fecha), así ambas pestañas quedan sincronizadas.
  const inicio = inicioDeSemana(fecha);
  const dias = Array.from({ length: 7 }, (_, i) => toISODate(addDays(new Date(`${inicio}T00:00:00`), i)));
  const porDia = dias.map((fecha) => {
    const citas = data.citas.filter((c) => c.fecha === fecha && c.estado !== "cancelada").sort((a, b) => a.hora.localeCompare(b.hora));
    return {
      fecha,
      items: filaItems(citas, comidaDeFecha(data, fecha), { onCobrar, onMover, onCancelar, negocioNombre, negocioId, pendientesPorId, msg28 }),
    };
  });
  const hayAlgo = porDia.some((d) => d.items.length > 0);

  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onCambiarFecha(toISODate(addDays(new Date(`${inicio}T00:00:00`), -7)))}
          aria-label="Semana anterior"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {inicio !== inicioDeSemana(hoy) && (
          <button
            type="button"
            onClick={() => onCambiarFecha(hoy)}
            className="font-mono text-[10px] uppercase tracking-widest text-primary"
          >
            Volver a esta semana
          </button>
        )}
        <button
          type="button"
          onClick={() => onCambiarFecha(toISODate(addDays(new Date(`${inicio}T00:00:00`), 7)))}
          aria-label="Semana siguiente"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {!hayAlgo ? (
        <EmptyState texto="Sin citas esta semana" />
      ) : (
        porDia
          .filter((d) => d.items.length > 0)
          .map((d) => (
            <div key={d.fecha}>
              <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {d.fecha === hoy
                  ? "Hoy"
                  : d.fecha === diaSiguiente(hoy)
                    ? "Mañana"
                    : new Date(`${d.fecha}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" })}
              </p>
              <div className="flex flex-col gap-2">{d.items.map((it) => it.node)}</div>
            </div>
          ))
      )}
    </div>
  );
}

/** Franja de comida del día de la semana al que cae `fecha` — null si ese día no tiene (o está cerrado). */
function comidaDeFecha(data: BarberiaData, fecha: string): { inicio: string; fin: string } | null {
  const h = data.horario.find((h) => h.dia === diaCodigoDeFecha(fecha));
  if (!h?.abierto || !h.comidaInicio || !h.comidaFin) return null;
  return { inicio: h.comidaInicio, fin: h.comidaFin };
}

/** Une citas + el bloque de comida (si aplica) en un solo arreglo ordenado por hora — el gris de "En comida" se intercala donde le toca cronológicamente, no siempre arriba. */
function filaItems(
  citas: Appointment[],
  comida: { inicio: string; fin: string } | null,
  props: {
    onCobrar: (c: Appointment) => void;
    onMover: (c: Appointment) => void;
    onCancelar: (c: Appointment) => void;
    negocioNombre: string;
    negocioId: string;
    pendientesPorId: Map<string, VentaPendienteRow>;
    msg28: boolean;
  }
): { hora: string; node: React.ReactNode }[] {
  const rows: { hora: string; node: React.ReactNode }[] = citas.map((c) => ({
    hora: c.hora,
    node: (
      <CitaRow
        key={c.id}
        cita={c}
        onCobrar={props.onCobrar}
        onMover={props.onMover}
        onCancelar={props.onCancelar}
        negocioNombre={props.negocioNombre}
        negocioId={props.negocioId}
        fila={props.pendientesPorId.get(c.id)}
        msg28={props.msg28}
      />
    ),
  }));
  if (comida) {
    rows.push({ hora: comida.inicio, node: <ComidaRow key="comida" inicio={comida.inicio} fin={comida.fin} /> });
  }
  return rows.sort((a, b) => a.hora.localeCompare(b.hora));
}

function ComidaRow({ inicio, fin }: { inicio: string; fin: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/50 p-3 text-muted-foreground">
      <div className="w-16 shrink-0 font-mono text-sm">{formatHora12(inicio)}</div>
      <p className="flex-1 text-sm font-medium">🍽️ En comida</p>
      <span className="shrink-0 font-mono text-xs uppercase tracking-widest">hasta {formatHora12(fin)}</span>
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
        <div className="mt-1">
          <EmpleadoBadge nombre={c.empleadoNombreCache} rol={c.empleadoRolCache} />
        </div>
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
          // Mismo candado que el botón rápido de arriba (msg28, plan Pro/
          // Pro+): antes este ítem del menú mandaba el mismo mensaje sin
          // ningún bloqueo, así que básico se lo saltaba entero por aquí —
          // no tiene caso bloquear un lado y dejar la otra puerta abierta.
          ...(c.clienteTelefono && msg28
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
  data,
  timezone,
  onClose,
  onGuardar,
}: {
  cita: Appointment | null;
  data: BarberiaData;
  timezone?: string;
  onClose: () => void;
  onGuardar: (id: string, fecha: string, hora: string) => void;
}) {
  const [fecha, setFecha] = React.useState("");
  const [hora, setHora] = React.useState("");
  // Sin la propia cita en la lista de ocupados: si no, su propio horario
  // actual se vería como "Ocupado" al reabrir el mismo día en el picker.
  const slots = React.useMemo(
    () => (cita && fecha ? getDaySlots({ ...data, citas: data.citas.filter((c) => c.id !== cita.id) }, fecha, timezone) : []),
    [data, cita, fecha, timezone]
  );
  // Igual que en Nueva Cita: un slot "libre" individual no basta, hace
  // falta que la duración COMPLETA del servicio de esta cita quepa sin
  // traslaparse con otra más adelante (ver getAvailableSlotsForDuracion).
  const duracionServicio = data.servicios.find((s) => s.id === cita?.servicioId)?.duracion_min ?? 30;
  const horasQueSiAlcanzan = React.useMemo(
    () =>
      new Set(
        cita && fecha
          ? getAvailableSlotsForDuracion({ ...data, citas: data.citas.filter((c) => c.id !== cita.id) }, fecha, duracionServicio, timezone)
          : []
      ),
    [data, cita, fecha, duracionServicio, timezone]
  );

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
              <Input
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  setHora("");
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin horario disponible este día.</p>
              ) : (
                <ChipGroup>
                  {slots.map((s) => (
                    <Chip key={s.hora} selected={hora === s.hora} disabled={!horasQueSiAlcanzan.has(s.hora)} onClick={() => setHora(s.hora)}>
                      {formatHora12(s.hora)}
                      {s.estado === "comida" && " · En comida"}
                      {s.estado === "ocupado" && " · Ocupado"}
                      {s.estado === "libre" && !horasQueSiAlcanzan.has(s.hora) && " · No alcanza"}
                    </Chip>
                  ))}
                </ChipGroup>
              )}
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
