"use client";

import * as React from "react";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Trash2, MapPin, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingBlock } from "@/components/app-shell/loading";
import { formatMoney } from "@/lib/mock";
import {
  fetchPropiedades,
  createPropiedad,
  updatePropiedad,
  deletePropiedad,
  type Propiedad,
  type PropiedadInput,
  type EstadoPropiedad,
} from "@/lib/rentas";

// Módulo real (no placeholder): CRUD de propiedades contra rentas_propiedades.
// Sin negocio/session de por medio — solo el admin llega aquí hoy (ver
// RUTAS_SUPER_ADMIN en components/app-shell/authenticated-shell.tsx).

const ESTADO_LABEL: Record<EstadoPropiedad, string> = {
  disponible: "Disponible",
  rentada: "Rentada",
};

// Los errores de Supabase (PostgrestError) son objetos planos, no instancias
// de Error — "err instanceof Error" siempre es false para ellos.
function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export default function RentasPage() {
  const [propiedades, setPropiedades] = React.useState<Propiedad[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [formTarget, setFormTarget] = React.useState<Propiedad | "nueva" | null>(null);
  const [borrando, setBorrando] = React.useState<Propiedad | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setPropiedades(await fetchPropiedades());
    } catch (err) {
      console.error("No se pudieron cargar las propiedades:", err);
      toast.error(getErrorMessage(err, "No se pudieron cargar tus propiedades."));
      // Sin esto, si nunca hubo un propiedades[] previo, el guard
      // "loading || !propiedades" de abajo se queda mostrando el spinner
      // para siempre — el toast ya desapareció pero la pantalla parece
      // congelada.
      setPropiedades((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!borrando) return;
    try {
      await deletePropiedad(borrando.id);
      toast.success(`${borrando.nombre} eliminada.`);
      setBorrando(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo eliminar la propiedad."));
    }
  }

  if (loading || !propiedades) return <LoadingBlock />;

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Rentas</h1>
            <p className="text-sm text-muted-foreground">{propiedades.length} propiedades</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setFormTarget("nueva")}>
          <Plus className="h-4 w-4" /> Nueva Propiedad
        </Button>
      </div>

      {propiedades.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          Todavía no tienes propiedades registradas.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {propiedades.map((p) => (
            <div key={p.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold">{p.nombre}</p>
                  {p.direccion && (
                    <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="truncate">{p.direccion}</span>
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                    p.estado === "disponible" ? "bg-ledger/10 text-ledger" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {ESTADO_LABEL[p.estado]}
                </span>
              </div>

              <p className="font-display text-lg font-bold text-ledger">{formatMoney(p.precio)}/mes</p>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setFormTarget(p)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-destructive hover:bg-destructive/10"
                  onClick={() => setBorrando(p)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PropiedadDialog
        open={formTarget !== null}
        propiedad={formTarget && formTarget !== "nueva" ? formTarget : null}
        onClose={() => setFormTarget(null)}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar propiedad"
        description={`¿Seguro que quieres eliminar "${borrando?.nombre}"? Esta acción no se puede deshacer.`}
        onClose={() => setBorrando(null)}
        onConfirm={handleDelete}
      />
    </main>
  );
}

function PropiedadDialog({
  open,
  propiedad,
  onClose,
  onSaved,
}: {
  open: boolean;
  propiedad: Propiedad | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = React.useState("");
  const [direccion, setDireccion] = React.useState("");
  const [precio, setPrecio] = React.useState("");
  const [estado, setEstado] = React.useState<EstadoPropiedad>("disponible");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setNombre(propiedad?.nombre ?? "");
    setDireccion(propiedad?.direccion ?? "");
    setPrecio(propiedad ? String(propiedad.precio) : "");
    setEstado(propiedad?.estado ?? "disponible");
  }, [open, propiedad]);

  const precioNumero = Number(precio);
  const puedeGuardar = nombre.trim().length > 1 && precio.trim().length > 0 && !Number.isNaN(precioNumero) && precioNumero >= 0;

  async function guardar() {
    if (!puedeGuardar) return;
    setSaving(true);
    const input: PropiedadInput = { nombre: nombre.trim(), direccion, precio: precioNumero, estado };
    try {
      if (propiedad) {
        await updatePropiedad(propiedad.id, input);
        toast.success(`${input.nombre} actualizada`);
      } else {
        await createPropiedad(input);
        toast.success(`${input.nombre} registrada`);
      }
      onClose();
      onSaved();
    } catch (err) {
      console.error("No se pudo guardar la propiedad:", err);
      toast.error(getErrorMessage(err, "No se pudo guardar la propiedad."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader title={propiedad ? "Editar propiedad" : "Nueva propiedad"} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Depa Centro 3B" />
        </div>
        <div className="space-y-1.5">
          <Label>Dirección</Label>
          <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ej. Av. México 123" />
        </div>
        <div className="space-y-1.5">
          <Label>Precio mensual (MXN)</Label>
          <Input
            type="number"
            min="0"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="5000"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoPropiedad)}>
            <option value="disponible">Disponible</option>
            <option value="rentada">Rentada</option>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button disabled={!puedeGuardar || saving} onClick={guardar}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : propiedad ? "Guardar cambios" : "Crear propiedad"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
