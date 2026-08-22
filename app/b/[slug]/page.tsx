"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, MessageCircle, CheckCircle2, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { LoadingBlock } from "@/components/app-shell/loading";
import { SiteFooter } from "@/components/site-footer";
import { getAvailableSlots } from "@/lib/agenda";
import { fetchNegocioBySlug, fetchPublicBookingData, submitPublicCita, type PublicBookingData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { readDemoPreview, writeDemoPreview } from "@/lib/demoPreview";
import { formatHora12, formatMoney, toISODate, todayISO, waLink, whatsappDe } from "@/lib/mock";
import { nombreSchema, telefonoSchema } from "@/lib/validation";
import type { Business, Appointment } from "@/lib/types";

// Lun-Dom en vez del Dom-Sáb de JS Date.getDay() — solo para el orden en
// que se pintan los chips; `dow` sigue siendo el índice nativo (0=Dom) que
// espera Date.getDay().
const DIAS_SEMANA_UI = [
  { label: "Lun", dow: 1 },
  { label: "Mar", dow: 2 },
  { label: "Mié", dow: 3 },
  { label: "Jue", dow: 4 },
  { label: "Vie", dow: 5 },
  { label: "Sáb", dow: 6 },
  { label: "Dom", dow: 0 },
] as const;

/** Próxima fecha (hoy o después) que cae en ese día de la semana. */
function proximaFechaParaDia(dow: number): string {
  const hoy = new Date();
  const delta = (dow - hoy.getDay() + 7) % 7;
  const d = new Date(hoy);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

function formatFechaLarga(fechaISO: string): string {
  return new Date(`${fechaISO}T00:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function ReservaPublicaPage() {
  const params = useParams<{ slug: string }>();

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [business, setBusiness] = React.useState<Business | null>(null);
  const [booking, setBooking] = React.useState<PublicBookingData | null>(null);

  const [servicioId, setServicioId] = React.useState<string | null>(null);
  const [fecha, setFecha] = React.useState(todayISO(0));
  const [hora, setHora] = React.useState<string | null>(null);
  const [nombre, setNombre] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [reservaError, setReservaError] = React.useState<string | null>(null);
  const [confirmada, setConfirmada] = React.useState<{ servicio: string; fecha: string; hora: string } | null>(null);
  // Negocio armado con generateDemoBarberia (/demo/barberia) vive solo en
  // localStorage (demoPreview) hasta que alguien inicia sesión y lo activa —
  // nunca hay una fila real en `negocios` que fetchNegocioBySlug pueda
  // encontrar. Sin este fallback, /b/{slug} de una demo siempre mostraba
  // "Negocio no encontrado".
  const [modoDemo, setModoDemo] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    function cargarDesdeDemo(): boolean {
      const demo = readDemoPreview();
      if (demo?.business.slug !== params.slug || demo.business.tipo !== "barberia" || !demo.barberia) return false;
      setBusiness(demo.business);
      setBooking({
        servicios: demo.barberia.servicios,
        horario: demo.barberia.horario,
        excepciones: demo.barberia.excepciones,
        citas: demo.barberia.citas.map((c) => ({ fecha: c.fecha, hora: c.hora, estado: c.estado, servicioId: c.servicioId })),
      });
      setModoDemo(true);
      return true;
    }

    async function load() {
      try {
        if (!isSupabaseConfigured) {
          cargarDesdeDemo();
          return;
        }
        const biz = await fetchNegocioBySlug(params.slug);
        if (cancelled) return;
        if (!biz || biz.tipo !== "barberia") {
          cargarDesdeDemo();
          return;
        }
        const data = await fetchPublicBookingData(biz.id);
        if (cancelled) return;
        setBusiness(biz);
        setBooking(data);
      } catch (err) {
        console.error("No se pudo cargar el negocio:", err);
        if (!cancelled && !cargarDesdeDemo()) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  if (loading) return <LoadingBlock />;

  if (!business || !booking) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Scissors className="h-8 w-8 text-muted-foreground" />
        <p className="font-display text-lg font-semibold">Negocio no encontrado</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {loadError
            ? "No pudimos cargar esta página de reservas. Intenta de nuevo en un momento."
            : `No encontramos un negocio activo en /b/${params.slug}.`}
        </p>
        <Button asChild variant="outline">
          <Link href="/">Ir al inicio</Link>
        </Button>
      </main>
    );
  }

  const servicio = booking.servicios.find((s) => s.id === servicioId) ?? booking.servicios[0];
  const slots = getAvailableSlots(booking, fecha);
  const numeroWhatsapp = whatsappDe(business);

  async function reservar() {
    if (!servicio || !hora || nombre.trim().length < 2 || telefono.trim().length < 6) return;

    const nombreParsed = nombreSchema.safeParse(nombre);
    const telefonoParsed = telefonoSchema.safeParse(telefono.replace(/\D/g, ""));
    if (!nombreParsed.success) {
      setReservaError(nombreParsed.error.errors[0]?.message ?? "Nombre inválido.");
      return;
    }
    if (!telefonoParsed.success) {
      setReservaError(telefonoParsed.error.errors[0]?.message ?? "Teléfono inválido.");
      return;
    }

    setEnviando(true);
    setReservaError(null);
    const nombreFinal = nombreParsed.data;
    const telefonoFinal = telefonoParsed.data;
    try {
      if (modoDemo) {
        // Mismo flujo que en Supabase (buscar por teléfono, crear o
        // actualizar nombre) pero contra el demoPreview local, ya que un
        // negocio de demo no tiene fila real en Supabase para el RPC.
        const demo = readDemoPreview();
        if (demo?.barberia) {
          const existente = demo.barberia.clientes.find((c) => c.telefono.trim() === telefonoFinal);
          let clientes = demo.barberia.clientes;
          let clienteId: string;
          if (existente) {
            clienteId = existente.id;
            if (existente.nombre !== nombreFinal) {
              clientes = clientes.map((c) => (c.id === existente.id ? { ...c, nombre: nombreFinal } : c));
            }
          } else {
            const nuevo = { id: crypto.randomUUID(), nombre: nombreFinal, telefono: telefonoFinal, ultimaVisita: null, visitas: 0 };
            clientes = [nuevo, ...clientes];
            clienteId = nuevo.id;
          }
          const nuevaCita: Appointment = {
            id: crypto.randomUUID(),
            clienteId,
            clienteNombre: nombreFinal,
            clienteTelefono: telefonoFinal,
            servicioId: servicio.id,
            servicioNombre: servicio.nombre,
            precio: servicio.precio,
            fecha,
            hora,
            estado: "pendiente",
          };
          writeDemoPreview({ ...demo, barberia: { ...demo.barberia, clientes, citas: [nuevaCita, ...demo.barberia.citas] } });
        }
      } else {
        await submitPublicCita(params.slug, {
          servicioId: servicio.id,
          nombre: nombreFinal,
          telefono: telefonoFinal,
          fecha,
          hora,
        });
      }
      setConfirmada({ servicio: servicio.nombre, fecha, hora });
    } catch (err) {
      console.error("No se pudo agendar la cita.");
      setReservaError(err instanceof Error ? err.message : "No se pudo agendar tu cita. Intenta de nuevo.");
      setEnviando(false);
    }
  }

  if (confirmada) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-ledger" />
        <div>
          <h1 className="font-display text-xl font-bold">¡Cita agendada!</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            {confirmada.servicio} el {confirmada.fecha} a las {formatHora12(confirmada.hora)} en {business.nombre}.
          </p>
        </div>
        {numeroWhatsapp ? (
          <Button asChild variant="outline">
            <Link
              href={waLink(
                numeroWhatsapp,
                `Hola, acabo de agendar una cita de ${confirmada.servicio} en ${business.nombre} para el ${confirmada.fecha} a las ${formatHora12(confirmada.hora)}. ¡Confirmo!`
              )}
            >
              <MessageCircle className="h-4 w-4" /> Confirmar por WhatsApp
            </Link>
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Este negocio todavía no configuró su WhatsApp para citas.</p>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-12">
      <div className="border-b border-border/60 bg-surface/60 px-6 py-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Scissors className="h-6 w-6" />
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">{business.nombre}</h1>
        {business.direccion && (
          <p className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {business.direccion}
          </p>
        )}
        {numeroWhatsapp ? (
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href={waLink(numeroWhatsapp, `Hola, quiero agendar una cita en ${business.nombre}`)} target="_blank">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Link>
          </Button>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">Configura tu WhatsApp en Ajustes</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          ¿Ya tienes cita?{" "}
          <Link href={`/b/${params.slug}/cliente`} className="font-medium text-primary underline-offset-2 hover:underline">
            Ver mi cita
          </Link>
        </p>
      </div>

      <div className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-6">
        <div className="space-y-2">
          <Label className="text-sm normal-case tracking-normal text-foreground">Elige tu servicio</Label>
          <ChipGroup>
            {booking.servicios.map((s) => (
              <Chip key={s.id} selected={(servicioId ?? booking.servicios[0]?.id) === s.id} onClick={() => setServicioId(s.id)}>
                {s.nombre} · {formatMoney(s.precio)}
              </Chip>
            ))}
          </ChipGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-sm normal-case tracking-normal text-foreground">Elige el día</Label>
          <ChipGroup>
            <Chip
              selected={fecha === todayISO(0)}
              onClick={() => {
                setFecha(todayISO(0));
                setHora(null);
              }}
            >
              Hoy
            </Chip>
            <Chip
              selected={fecha === todayISO(1)}
              onClick={() => {
                setFecha(todayISO(1));
                setHora(null);
              }}
            >
              Mañana
            </Chip>
          </ChipGroup>
          <ChipGroup>
            {DIAS_SEMANA_UI.map((d) => {
              const fechaDia = proximaFechaParaDia(d.dow);
              return (
                <Chip
                  key={d.dow}
                  selected={fecha === fechaDia}
                  onClick={() => {
                    setFecha(fechaDia);
                    setHora(null);
                  }}
                >
                  {d.label}
                </Chip>
              );
            })}
          </ChipGroup>
          <p className="text-xs capitalize text-muted-foreground">{formatFechaLarga(fecha)}</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm normal-case tracking-normal text-foreground">Horas disponibles</Label>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay horarios disponibles este día.</p>
          ) : (
            <ChipGroup>
              {slots.map((s) => (
                <Chip key={s} selected={hora === s} onClick={() => setHora(s)}>
                  {formatHora12(s)}
                </Chip>
              ))}
            </ChipGroup>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tu nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label>Tu teléfono</Label>
            <Input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="331 000 0000"
              maxLength={15}
            />
          </div>
        </div>

        {reservaError && <p className="text-center text-sm text-destructive">{reservaError}</p>}

        <Button
          size="lg"
          disabled={!hora || nombre.trim().length < 2 || telefono.trim().length < 6 || enviando}
          onClick={reservar}
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reservar cita"}
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">
          Al continuar aceptas nuestro{" "}
          <Link href="/aviso-privacidad" className="underline underline-offset-2 hover:text-foreground">
            Aviso de Privacidad
          </Link>{" "}
          y{" "}
          <Link href="/terminos" className="underline underline-offset-2 hover:text-foreground">
            Términos
          </Link>
          .
        </p>
      </div>
      <SiteFooter />
    </main>
  );
}
