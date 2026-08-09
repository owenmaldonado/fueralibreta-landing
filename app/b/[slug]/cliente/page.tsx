"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, MessageCircle, Scissors, CalendarCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock } from "@/components/app-shell/loading";
import { SiteFooter } from "@/components/site-footer";
import { fetchNegocioBySlug, fetchCitasByTelefono, type CitaCliente } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { readDemoPreview } from "@/lib/demoPreview";
import { formatMoney, mensajeRecordatorioCita, waLink } from "@/lib/mock";
import { telefonoSchema } from "@/lib/validation";
import type { Business } from "@/lib/types";

/**
 * Vista pública de autoservicio para un cliente que ya tiene cita: busca
 * por su propio teléfono (sin login) y ve el mismo mensaje de recordatorio
 * que antes solo mandaba el dueño desde el panel /app/agenda.
 */
export default function ClientePublicoPage() {
  const params = useParams<{ slug: string }>();

  const [loading, setLoading] = React.useState(true);
  const [business, setBusiness] = React.useState<Business | null>(null);
  const [modoDemo, setModoDemo] = React.useState(false);

  const [telefono, setTelefono] = React.useState("");
  const [buscando, setBuscando] = React.useState(false);
  const [buscado, setBuscado] = React.useState(false);
  const [citas, setCitas] = React.useState<CitaCliente[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    function cargarDesdeDemo(): boolean {
      const demo = readDemoPreview();
      if (demo?.business.slug !== params.slug || demo.business.tipo !== "barberia" || !demo.barberia) return false;
      setBusiness(demo.business);
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
        setBusiness(biz);
      } catch (err) {
        console.error("No se pudo cargar el negocio:", err);
        cargarDesdeDemo();
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

  if (!business) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Scissors className="h-8 w-8 text-muted-foreground" />
        <p className="font-display text-lg font-semibold">Negocio no encontrado</p>
        <p className="max-w-xs text-sm text-muted-foreground">No encontramos un negocio activo en /b/{params.slug}.</p>
        <Button asChild variant="outline">
          <Link href="/">Ir al inicio</Link>
        </Button>
      </main>
    );
  }

  async function buscar() {
    const parsed = telefonoSchema.safeParse(telefono.replace(/\D/g, ""));
    if (!parsed.success) return;
    const tel = parsed.data;
    setBuscando(true);
    setBuscado(false);
    try {
      if (modoDemo) {
        const demo = readDemoPreview();
        const propias = (demo?.barberia?.citas ?? [])
          .filter((c) => c.clienteTelefono.trim() === tel && c.estado === "pendiente")
          .map((c) => ({
            clienteNombre: c.clienteNombre,
            servicioNombre: c.servicioNombre,
            precio: c.precio,
            fecha: c.fecha,
            hora: c.hora,
          }))
          .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
        setCitas(propias);
      } else {
        const propias = await fetchCitasByTelefono(params.slug, tel);
        setCitas(propias);
      }
    } catch (err) {
      console.error("No se pudieron buscar tus citas.");
      setCitas([]);
    } finally {
      setBuscando(false);
      setBuscado(true);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-12">
      <div className="border-b border-border/60 bg-surface/60 px-6 py-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CalendarCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">{business.nombre}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ve tu próxima cita con tu número de teléfono</p>
      </div>

      <div className="mx-auto flex max-w-sm flex-col gap-5 px-6 py-6">
        <div className="space-y-1.5">
          <Label>Tu teléfono</Label>
          <Input
            type="tel"
            autoFocus
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="331 000 0000"
            maxLength={15}
          />
        </div>
        <Button size="lg" disabled={telefono.trim().length < 6 || buscando} onClick={buscar}>
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ver mi cita"}
        </Button>

        {buscado && (
          <div className="flex flex-col gap-3">
            {citas.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                No encontramos ninguna cita pendiente con ese teléfono.
              </p>
            ) : (
              citas.map((c, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold">{c.servicioNombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(`${c.fecha}T00:00:00`).toLocaleDateString("es-MX", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    · {c.hora} · {formatMoney(c.precio)}
                  </p>
                  <p className="mt-3 text-sm">{mensajeRecordatorioCita(c, business.nombre)}</p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href={waLink(business.telefono, `Hola, tengo una cita el ${c.fecha} a las ${c.hora}`)} target="_blank">
                      <MessageCircle className="h-4 w-4" /> Confirmar por WhatsApp
                    </Link>
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
