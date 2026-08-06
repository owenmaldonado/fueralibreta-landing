"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Users, TrendingUp, Loader2, LayoutGrid, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { LoadingBlock } from "@/components/app-shell/loading";
import { formatMoney } from "@/lib/mock";
import { fetchAppsConStats, createMisApp, type AppConStats } from "@/lib/admin-apps";

/** Únicas apps con un destino real construido hoy — el resto muestra "Próximamente" en vez de un link muerto. */
const APPS_CONSTRUIDAS = new Set(["fuera-libreta", "rentas"]);

// icono/color son puramente cosméticos y viven aquí, no en mis_apps (esa
// tabla en producción no tiene esas columnas — ver supabase.sql). Slugs sin
// entrada usan DEFAULT_LOOK, elegido de forma estable por hash del slug para
// no repetir siempre el mismo color en apps nuevas.
const APP_LOOK: Record<string, { icono: string; color: string }> = {
  "fuera-libreta": { icono: "📒", color: "#f97316" },
  rentas: { icono: "🏠", color: "#0ea5e9" },
};
const PALETA_DEFAULT = [
  { icono: "📦", color: "#6366f1" },
  { icono: "🏠", color: "#0ea5e9" },
  { icono: "🛠️", color: "#22c55e" },
  { icono: "📅", color: "#a855f7" },
  { icono: "💼", color: "#ec4899" },
];

function lookFor(slug: string): { icono: string; color: string } {
  if (APP_LOOK[slug]) return APP_LOOK[slug];
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return PALETA_DEFAULT[hash % PALETA_DEFAULT.length];
}

// Los errores de Supabase (PostgrestError) son objetos planos, no instancias
// de Error — "err instanceof Error" siempre es false para ellos y se perdía
// el mensaje real (tabla/columna faltante, policy de RLS, etc.) detrás de un
// genérico "No se pudieron cargar tus apps".
function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function slugifyAppName(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function AdminHub() {
  const [apps, setApps] = React.useState<AppConStats[] | null>(null);
  const [misAppsError, setMisAppsError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [nuevaAppOpen, setNuevaAppOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAppsConStats();
      setApps(result.apps);
      setMisAppsError(result.misAppsError);
      if (result.misAppsError) {
        console.error("mis_apps no se pudo leer, mostrando negocios directo:", result.misAppsError);
      }
    } catch (err) {
      console.error("No se pudieron cargar tus negocios:", err);
      toast.error(getErrorMessage(err, "No se pudieron cargar tus apps."));
      // Sin esto, si nunca hubo un apps[] previo, el guard "loading || !apps"
      // de abajo se queda mostrando el spinner para siempre — el toast ya
      // desapareció pero la pantalla parece congelada.
      setApps((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading || !apps) return <LoadingBlock />;

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Mis apps</h1>
            <p className="text-sm text-muted-foreground">{apps.length} apps registradas</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setNuevaAppOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva App
        </Button>
      </div>

      {misAppsError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No se pudo leer el registro de apps (mis_apps): {misAppsError}. Mostrando tus negocios directo desde la
            tabla negocios mientras lo arreglas.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {apps.map((app) => {
          const construida = APPS_CONSTRUIDAS.has(app.slug);
          const look = lookFor(app.slug);
          return (
            <div key={app.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                  style={{ backgroundColor: `${look.color}22` }}
                >
                  {look.icono}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold">{app.nombre}</p>
                  {app.descripcion && <p className="truncate text-xs text-muted-foreground">{app.descripcion}</p>}
                </div>
                {!app.activo && (
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Inactiva
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border p-2.5 text-center">
                  <p className="flex items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <Users className="h-3 w-3" /> Clientes
                  </p>
                  <p className="mt-1 font-display text-lg font-bold">{app.totalClientes}</p>
                </div>
                <div className="rounded-lg border border-border p-2.5 text-center">
                  <p className="flex items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <TrendingUp className="h-3 w-3" /> Ingresos
                  </p>
                  <p className="mt-1 font-display text-lg font-bold text-ledger">{formatMoney(app.ingresosMrr)}</p>
                </div>
              </div>

              {construida ? (
                <Button asChild size="lg" className="w-full">
                  <Link href={`/app/${app.slug}`}>Entrar</Link>
                </Button>
              ) : (
                <Button size="lg" className="w-full" variant="outline" disabled>
                  Próximamente
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <NuevaAppDialog open={nuevaAppOpen} onClose={() => setNuevaAppOpen(false)} onCreated={load} />
    </main>
  );
}

function NuevaAppDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [nombre, setNombre] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugEditado, setSlugEditado] = React.useState(false);
  const [descripcion, setDescripcion] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setNombre("");
      setSlug("");
      setSlugEditado(false);
      setDescripcion("");
    }
  }, [open]);

  const puedeGuardar = nombre.trim().length > 1 && slug.trim().length > 1;

  function onNombreChange(v: string) {
    setNombre(v);
    if (!slugEditado) setSlug(slugifyAppName(v));
  }

  async function guardar() {
    if (!puedeGuardar) return;
    setSaving(true);
    try {
      await createMisApp({ nombre: nombre.trim(), slug: slug.trim(), descripcion });
      toast.success(`${nombre.trim()} registrada`);
      onClose();
      onCreated();
    } catch (err) {
      console.error("No se pudo crear la app en mis_apps:", err);
      toast.error(getErrorMessage(err, "No se pudo crear la app."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader title="Nueva app" description="Solo la registra — no genera código todavía." onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => onNombreChange(e.target.value)} placeholder="Ej. Rentas" />
        </div>
        <div className="space-y-1.5">
          <Label>Slug (será /app/{slug || "slug"})</Label>
          <Input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEditado(true);
            }}
            placeholder="rentas"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Descripción</Label>
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Renta de departamentos" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button disabled={!puedeGuardar || saving} onClick={guardar}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear app"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
