"use client";

import * as React from "react";
import { Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { EmptyState } from "@/components/dashboards/empty-state";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { supabase } from "@/lib/supabase";

interface CatalogoRow {
  codigoBarras: string;
  nombre: string;
  marca: string | null;
  presentacion: string | null;
  vecesUsado: number;
}

/**
 * Tab "Catálogo" del panel /admin (ver components/admin/admin-panel.tsx) —
 * ver/editar/borrar catalogo_global (supabase/migrations/
 * 20260815010000_catalogo_global.sql). El listado usa la sesión normal del
 * admin (catalogo_global_select + catalogo_global_admin_all ya le dan
 * lectura); editar/borrar pega a /api/admin/catalogo/[codigo], que corre
 * con service_role — mismo patrón que el resto de /api/admin/*.
 */
export function CatalogoTab() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<CatalogoRow[] | null>(null);
  const [editando, setEditando] = React.useState<CatalogoRow | null>(null);
  const [borrando, setBorrando] = React.useState<CatalogoRow | null>(null);

  const cargar = React.useCallback(() => {
    supabase
      .from("catalogo_global")
      .select("codigo_barras, nombre, marca, presentacion, veces_usado")
      .order("veces_usado", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) {
          console.error("No se pudo cargar el catálogo global:", error);
          setRows([]);
          return;
        }
        setRows(
          (data ?? []).map((r) => ({
            codigoBarras: r.codigo_barras as string,
            nombre: r.nombre as string,
            marca: (r.marca as string) ?? null,
            presentacion: (r.presentacion as string) ?? null,
            vecesUsado: r.veces_usado as number,
          }))
        );
      });
  }, []);

  React.useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = (rows ?? []).filter((r) => {
    const query = q.toLowerCase();
    return (
      r.nombre.toLowerCase().includes(query) ||
      r.codigoBarras.includes(q) ||
      (r.marca ?? "").toLowerCase().includes(query)
    );
  });

  async function borrar() {
    if (!borrando) return;
    const res = await fetch(`/api/admin/catalogo/${encodeURIComponent(borrando.codigoBarras)}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "No se pudo borrar.");
    toast.success("Borrado del catálogo global.");
    setBorrando(null);
    cargar();
  }

  return (
    <div className="mt-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, nombre o marca..." className="pl-9" />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border">
        {rows === null ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <EmptyState texto="Sin resultados en el catálogo global." />
        ) : (
          <div className="divide-y divide-border">
            {filtrados.map((r) => (
              <div key={r.codigoBarras} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.nombre}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {r.codigoBarras}
                    {r.marca ? ` · ${r.marca}` : ""}
                    {r.presentacion ? ` · ${r.presentacion}` : ""} · usado {r.vecesUsado}×
                  </p>
                </div>
                <button
                  onClick={() => setEditando(r)}
                  aria-label="Editar"
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setBorrando(r)}
                  aria-label="Borrar"
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <EditarCatalogoForm entry={editando} onClose={() => setEditando(null)} onGuardado={cargar} />}
      </Sheet>

      <ConfirmDeleteDialog
        open={!!borrando}
        title="Borrar del catálogo"
        description={`Se borrará "${borrando?.nombre}" (${borrando?.codigoBarras}) del catálogo global compartido. No afecta el inventario de ningún negocio, solo el autocompletado futuro al escanear ese código.`}
        onClose={() => setBorrando(null)}
        onConfirm={borrar}
      />
    </div>
  );
}

function EditarCatalogoForm({
  entry,
  onClose,
  onGuardado,
}: {
  entry: CatalogoRow;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = React.useState(entry.nombre);
  const [marca, setMarca] = React.useState(entry.marca ?? "");
  const [presentacion, setPresentacion] = React.useState(entry.presentacion ?? "");
  const [guardando, setGuardando] = React.useState(false);

  async function guardar() {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/admin/catalogo/${encodeURIComponent(entry.codigoBarras)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), marca: marca.trim() || null, presentacion: presentacion.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo guardar.");
      toast.success("Catálogo actualizado.");
      onGuardado();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <SheetHeader title="Editar producto del catálogo" description={entry.codigoBarras} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Marca</Label>
          <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Opcional" />
        </div>
        <div className="space-y-1.5">
          <Label>Presentación</Label>
          <Input value={presentacion} onChange={(e) => setPresentacion(e.target.value)} placeholder="Ej. 45g (opcional)" />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!nombre.trim() || guardando} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </Button>
      </SheetFooter>
    </>
  );
}
