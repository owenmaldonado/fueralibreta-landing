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
import { getAvailableSlots } from "@/lib/agenda";
import { fetchNegocioBySlug, fetchPublicBookingData, insertPublicCita, type PublicBookingData } from "@/lib/data";
import { formatMoney, todayISO, waLink } from "@/lib/mock";
import type { Business } from "@/lib/types";

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
  const [reservaError, setReservaError] = React.useState(false);
  const [confirmada, setConfirmada] = React.useState<{ servicio: string; fecha: string; hora: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const biz = await fetchNegocioBySlug(params.slug);
        if (cancelled) return;
        if (!biz || biz.tipo !== "barberia") {
          setLoading(false);
          return;
        }
        const data = await fetchPublicBookingData(biz.id);
        if (cancelled) return;
        setBusiness(biz);
        setBooking(data);
      } catch (err) {
        console.error("No se pudo cargar el negocio:", err);
        if (!cancelled) setLoadError(true);
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
            : `No encontramos un negocio activo en /reserva/${params.slug}.`}
        </p>
        <Button asChild variant="outline">
          <Link href="/">Ir al inicio</Link>
        </Button>
      </main>
    );
  }

  const servicio = booking.servicios.find((s) => s.id === servicioId) ?? booking.servicios[0];
  const slots = getAvailableSlots(booking, fecha);

  async function reservar() {
    if (!servicio || !hora || nombre.trim().length < 2 || telefono.trim().length < 6) return;
    setEnviando(true);
    setReservaError(false);
    try {
      await insertPublicCita(business!.id, {
        clienteId: "",
        clienteNombre: nombre.trim(),
        clienteTelefono: telefono.trim(),
        servicioId: servicio.id,
        servicioNombre: servicio.nombre,
        precio: servicio.precio,
        fecha,
        hora,
        estado: "pendiente",
      });
      setConfirmada({ servicio: servicio.nombre, fecha, hora });
    } catch (err) {
      console.error("No se pudo agendar la cita:", err);
      setReservaError(true);
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
            {confirmada.servicio} el {confirmada.fecha} a las {confirmada.hora} en {business.nombre}.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link
            href={waLink(
              business.telefono,
              `Hola, acabo de agendar una cita en ${business.nombre} para el ${confirmada.fecha} a las ${confirmada.hora}`
            )}
          >
            <MessageCircle className="h-4 w-4" /> Confirmar por WhatsApp
          </Link>
        </Button>
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
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link href={waLink(business.telefono, `Hola, quiero agendar una cita en ${business.nombre}`)} target="_blank">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Link>
        </Button>
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
            <Chip
              selected={fecha === todayISO(2)}
              onClick={() => {
                setFecha(todayISO(2));
                setHora(null);
              }}
            >
              Pasado mañana
            </Chip>
          </ChipGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-sm normal-case tracking-normal text-foreground">Horas disponibles</Label>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay horarios disponibles este día.</p>
          ) : (
            <ChipGroup>
              {slots.map((s) => (
                <Chip key={s} selected={hora === s} onClick={() => setHora(s)}>
                  {s}
                </Chip>
              ))}
            </ChipGroup>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tu nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
          </div>
          <div className="space-y-1.5">
            <Label>Tu teléfono</Label>
            <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="331 000 0000" />
          </div>
        </div>

        {reservaError && (
          <p className="text-center text-sm text-destructive">No se pudo agendar tu cita. Intenta de nuevo.</p>
        )}

        <Button
          size="lg"
          disabled={!hora || nombre.trim().length < 2 || telefono.trim().length < 6 || enviando}
          onClick={reservar}
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reservar cita"}
        </Button>
      </div>
    </main>
  );
}
