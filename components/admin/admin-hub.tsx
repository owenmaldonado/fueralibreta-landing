"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Users, TrendingUp, Loader2, LayoutGrid } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { LoadingBlock } from "@/components/app-shell/loading";
import { formatMoney } from "@/lib/mock";
import { fetchAppsConStats, createMisApp, type AppConStats } from "@/lib/admin-apps";

/** Únicas apps con un destino real construido hoy — el resto muestra "Próximamente" en vez de un link muerto. */
const APPS_CONSTRUIDAS = new Set(["fuera-libreta"]);

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
  const [loading, setLoading] = React.useState(true);
  const [nuevaAppOpen, setNuevaAppOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setApps(await fetchAppsConStats());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron cargar tus apps.");
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {apps.map((app) => {
          const construida = APPS_CONSTRUIDAS.has(app.slug);
          return (
            <div key={app.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                  style={{ backgroundColor: app.color ? `${app.color}22` : "hsl(var(--primary) / 0.1)" }}
                >
                  {app.icono || "📦"}
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
  const [icono, setIcono] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setNombre("");
      setSlug("");
      setSlugEditado(false);
      setDescripcion("");
      setIcono("");
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
      await createMisApp({ nombre: nombre.trim(), slug: slug.trim(), descripcion, icono });
      toast.success(`${nombre.trim()} registrada`);
      onClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la app.");
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
        <div className="space-y-1.5">
          <Label>Ícono (emoji)</Label>
          <Input value={icono} onChange={(e) => setIcono(e.target.value)} placeholder="🏠" maxLength={4} />
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
