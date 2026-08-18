"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Tabs } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { EmptyState } from "@/components/dashboards/empty-state";
import { BloqueoPlan } from "@/components/dashboards/bloqueo-plan";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { formatMoney, todayISO, toISODate, uid } from "@/lib/mock";
import type { Business, HorarioDia } from "@/lib/types";

const SECTIONS = [
  { value: "perfil", label: "General" },
  { value: "horario", label: "Horario" },
  { value: "excepciones", label: "Excepciones" },
  { value: "servicios", label: "Servicios" },
];

// data.horario llega de Supabase con select("*") sin ORDER BY — el orden
// físico de fila no está garantizado (menos aún tras un upsert), así que
// "Lun, Mar, Mié..." no es confiable directo del arreglo. Se ordena aquí
// solo para el render, sin tocar cómo se guarda ni se lee.
const ORDEN_DIAS: HorarioDia["dia"][] = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function ConfiguracionPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [tab, setTab] = React.useState("horario");
  const [addExcepcion, setAddExcepcion] = React.useState(false);
  const [addServicio, setAddServicio] = React.useState(false);

  // El card "Servicios" de Más (ver app/app/mas/page.tsx) linkea directo
  // aquí con ?tab=servicios — lee la URL a mano en vez de useSearchParams()
  // por el mismo motivo que app/app/empleados/page.tsx: no forzar un
  // Suspense boundary en esta página.
  React.useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (tabParam && SECTIONS.some((s) => s.value === tabParam)) setTab(tabParam);
  }, []);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  const maxServicios = plan.giroBarberia.maxServicios;
  const tocoLimiteServicios = maxServicios !== null && data.servicios.length >= maxServicios;

  function actualizarDia(dia: HorarioDia["dia"], cambios: Partial<HorarioDia>) {
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, horario: b.horario.map((h) => (h.dia === dia ? { ...h, ...cambios } : h)) } };
    });
  }

  function borrarExcepcion(id: string) {
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, excepciones: b.excepciones.filter((e) => e.id !== id) } };
    });
  }

  function borrarServicio(id: string) {
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, servicios: b.servicios.filter((s) => s.id !== id) } };
    });
  }

  return (
    <>
      <PageHeader title="Configuración" />
      <div className="px-4 pb-4">
        <Tabs value={tab} onValueChange={setTab} tabs={SECTIONS} />
      </div>

      {tab === "perfil" && <PerfilSection business={session.business} update={update} />}

      {tab === "horario" && (
        <div className="flex flex-col gap-2 px-4 pb-24">
          {[...data.horario].sort((a, b) => ORDEN_DIAS.indexOf(a.dia) - ORDEN_DIAS.indexOf(b.dia)).map((h) => (
            <div key={h.dia} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-sm font-medium">{h.dia}</span>
                <Switch checked={h.abierto} onCheckedChange={(v) => actualizarDia(h.dia, { abierto: v })} />
                {!h.abierto && (
                  <Badge variant="outline" className="shrink-0">
                    Cerrado
                  </Badge>
                )}
              </div>
              <div className="flex flex-1 items-center gap-2">
                <Input
                  type="time"
                  value={h.inicio}
                  onChange={(e) => actualizarDia(h.dia, { inicio: e.target.value })}
                  disabled={!h.abierto}
                  className="h-9 min-w-0 w-full flex-1 text-sm"
                />
                <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">a</span>
                <Input
                  type="time"
                  value={h.fin}
                  onChange={(e) => actualizarDia(h.dia, { fin: e.target.value })}
                  disabled={!h.abierto}
                  className="h-9 min-w-0 w-full flex-1 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "excepciones" && (
        <div className="px-4 pb-6">
          <BloqueoPlan activo={plan.giroBarberia.excepciones} texto="Días especiales (vacaciones, cierres) disponible en Pro y Pro+">
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" className="self-start" onClick={() => setAddExcepcion(true)}>
                <Plus className="h-4 w-4" /> Agregar excepción
              </Button>
              {data.excepciones.length === 0 ? (
                <EmptyState texto="Sin días especiales configurados" />
              ) : (
                data.excepciones.map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                    <div>
                      <p className="text-sm font-medium">{e.etiqueta}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.fecha} · {e.cerrado ? "Cerrado" : `Cierra a las ${e.horaEspecialFin}`}
                      </p>
                    </div>
                    <button onClick={() => borrarExcepcion(e.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </BloqueoPlan>
        </div>
      )}

      {tab === "servicios" && (
        <div className="flex flex-col gap-2 px-4 pb-6">
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            disabled={tocoLimiteServicios}
            onClick={() => setAddServicio(true)}
          >
            <Plus className="h-4 w-4" /> Agregar servicio
          </Button>
          {tocoLimiteServicios && (
            <BloqueoPlan activo={false} compacto texto={`Llegaste al límite de ${plan.giroBarberia.maxServicios} servicios de tu plan ${plan.label}`} />
          )}
          {data.servicios.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div>
                <p className="text-sm font-medium">{s.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(s.precio)} · {s.duracion_min} min
                </p>
              </div>
              <button onClick={() => borrarServicio(s.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={addExcepcion} onOpenChange={setAddExcepcion}>
        <NuevaExcepcionForm onClose={() => setAddExcepcion(false)} update={update} />
      </Sheet>
      <Sheet open={addServicio} onOpenChange={setAddServicio}>
        <NuevoServicioForm onClose={() => setAddServicio(false)} update={update} />
      </Sheet>
    </>
  );
}

const DIAS_RECORDATORIO_DEFAULT = 28;

function PerfilSection({ business, update }: { business: Business; update: ReturnType<typeof useSession>["update"] }) {
  const [whatsapp, setWhatsapp] = React.useState(business.whatsapp ?? "");
  const [telefono, setTelefono] = React.useState(business.telefono ?? "");
  const [diasRecordatorio, setDiasRecordatorio] = React.useState(String(business.diasRecordatorio ?? DIAS_RECORDATORIO_DEFAULT));

  // Si update() sincroniza con Supabase en segundo plano y falla, session
  // vuelve a su valor previo — hay que reflejarlo aquí también, no solo en
  // el guardado optimista inicial.
  React.useEffect(() => {
    setWhatsapp(business.whatsapp ?? "");
    setTelefono(business.telefono ?? "");
    setDiasRecordatorio(String(business.diasRecordatorio ?? DIAS_RECORDATORIO_DEFAULT));
  }, [business.whatsapp, business.telefono, business.diasRecordatorio]);

  const cambiado =
    whatsapp.trim() !== (business.whatsapp ?? "") ||
    telefono.trim() !== (business.telefono ?? "") ||
    Number(diasRecordatorio) !== (business.diasRecordatorio ?? DIAS_RECORDATORIO_DEFAULT);

  function guardar() {
    const nuevoWhatsapp = whatsapp.trim();
    const nuevoTelefono = telefono.trim();
    const nuevoDias = Number(diasRecordatorio) || DIAS_RECORDATORIO_DEFAULT;
    update((prev) => ({
      ...prev,
      business: { ...prev.business, whatsapp: nuevoWhatsapp || undefined, telefono: nuevoTelefono, diasRecordatorio: nuevoDias },
    }));
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <div className="space-y-1.5">
        <Label>Número de WhatsApp para recibir citas</Label>
        <Input
          type="tel"
          inputMode="numeric"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="521XXXXXXXXXX"
        />
        <p className="text-xs text-muted-foreground">
          A este número llegan los botones de &ldquo;Confirmar por WhatsApp&rdquo; del link público de citas ({" "}
          <span className="font-mono">/b/{business.slug}</span>).
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Teléfono de recuperación (opcional)</Label>
        <Input
          type="tel"
          inputMode="numeric"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="331 000 0000"
        />
        <p className="text-xs text-muted-foreground">Ya no se pide al crear tu cuenta — es solo por si algún día lo necesitas para recuperar el acceso.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Días para recordatorio</Label>
        <Input
          type="number"
          inputMode="numeric"
          value={diasRecordatorio}
          onChange={(e) => setDiasRecordatorio(e.target.value)}
          placeholder="28"
        />
        <p className="text-xs text-muted-foreground">
          En Clientes, quien tenga más de estos días sin venir se marca con un aviso para recordarle que agende de nuevo.
        </p>
      </div>
      <Button size="lg" disabled={!cambiado} onClick={guardar} className="self-start">
        Guardar
      </Button>
    </div>
  );
}

function fechasEnRango(inicioISO: string, finISO: string): string[] {
  const [sy, sm, sd] = inicioISO.split("-").map(Number);
  const [ey, em, ed] = finISO.split("-").map(Number);
  const inicio = new Date(sy, sm - 1, sd);
  const fin = new Date(ey, em - 1, ed);
  const fechas: string[] = [];
  for (let d = new Date(inicio); d <= fin && fechas.length < 60; d.setDate(d.getDate() + 1)) {
    fechas.push(toISODate(new Date(d)));
  }
  return fechas;
}

function NuevaExcepcionForm({ onClose, update }: { onClose: () => void; update: ReturnType<typeof useSession>["update"] }) {
  const [etiqueta, setEtiqueta] = React.useState("");
  const [fechaInicio, setFechaInicio] = React.useState(todayISO(1));
  const [fechaFin, setFechaFin] = React.useState(todayISO(1));
  const [cerrado, setCerrado] = React.useState(true);
  const [horaEspecialFin, setHoraEspecialFin] = React.useState("14:00");

  const rango = fechaFin >= fechaInicio ? fechasEnRango(fechaInicio, fechaFin) : [];
  const puedeGuardar = etiqueta.trim().length > 1 && rango.length > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const b = prev.barberia!;
      const nuevas = rango.map((fecha) => ({
        id: uid("exc"),
        etiqueta: etiqueta.trim(),
        fecha,
        cerrado,
        horaEspecialFin: cerrado ? undefined : horaEspecialFin,
      }));
      return { ...prev, barberia: { ...b, excepciones: [...nuevas, ...b.excepciones] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nueva excepción" description="Ej. Vacaciones, cierro temprano..." onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Etiqueta</Label>
          <Input autoFocus value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Ej. Vacaciones" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Desde</Label>
            <Input
              type="date"
              value={fechaInicio}
              onChange={(e) => {
                setFechaInicio(e.target.value);
                if (e.target.value > fechaFin) setFechaFin(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hasta</Label>
            <Input type="date" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
        </div>
        {rango.length > 1 && <p className="text-xs text-muted-foreground">Se crearán {rango.length} excepciones, una por día.</p>}
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <p className="text-sm font-medium">Cerrado todo el día</p>
          <Switch checked={cerrado} onCheckedChange={setCerrado} />
        </div>
        {!cerrado && (
          <div className="space-y-1.5">
            <Label>Cierro a las</Label>
            <Input type="time" value={horaEspecialFin} onChange={(e) => setHoraEspecialFin(e.target.value)} />
          </div>
        )}
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar
        </Button>
      </SheetFooter>
    </>
  );
}

function NuevoServicioForm({ onClose, update }: { onClose: () => void; update: ReturnType<typeof useSession>["update"] }) {
  const [nombre, setNombre] = React.useState("");
  const [precio, setPrecio] = React.useState("");
  const [duracion, setDuracion] = React.useState("30");

  const puedeGuardar = nombre.trim().length > 1 && Number(precio) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const b = prev.barberia!;
      const servicio = { id: uid("srv"), nombre: nombre.trim(), precio: Number(precio), duracion_min: Number(duracion) || 30 };
      return { ...prev, barberia: { ...b, servicios: [servicio, ...b.servicios] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nuevo servicio" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Corte + diseño" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Precio</Label>
            <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$0" />
          </div>
          <div className="space-y-1.5">
            <Label>Duración (min)</Label>
            <Input type="number" inputMode="numeric" value={duracion} onChange={(e) => setDuracion(e.target.value)} />
          </div>
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar servicio
        </Button>
      </SheetFooter>
    </>
  );
}
