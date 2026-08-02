"use client";

import * as React from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Stepper } from "@/components/ui/stepper";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/session";
import { uid } from "@/lib/mock";
import { cn } from "@/lib/utils";
import type { InventoryProduct } from "@/lib/types";

export default function ProductosPage() {
  const { session, ready, update } = useSession();
  const [addOpen, setAddOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<InventoryProduct | null>(null);
  const [borrando, setBorrando] = React.useState<InventoryProduct | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;

  function ajustar(id: string, delta: number) {
    update((prev) => {
      const b = prev.barberia!;
      return {
        ...prev,
        barberia: { ...b, productos: b.productos.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)) },
      };
    });
  }

  function eliminar() {
    if (!borrando) return;
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, productos: b.productos.filter((p) => p.id !== borrando.id) } };
    });
    setBorrando(null);
  }

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle="Insumos del negocio"
        action={
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        }
      />
      <div className="flex flex-col gap-2 px-4 pb-6">
        {data.productos.map((p) => {
          const bajo = p.stock <= p.minimo;
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.nombre}</p>
                <p className={cn("text-xs", bajo ? "font-medium text-primary" : "text-muted-foreground")}>
                  Stock {p.stock} · mínimo {p.minimo}
                </p>
              </div>
              <Stepper value={p.stock} onChange={(v) => ajustar(p.id, v - p.stock)} />
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => setEditando(p)}
                  aria-label="Editar producto"
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setBorrando(p)}
                  aria-label="Eliminar producto"
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <ProductoForm onClose={() => setAddOpen(false)} update={update} />
      </Sheet>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <ProductoForm producto={editando} onClose={() => setEditando(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar producto"
        description={`Se borrará "${borrando?.nombre}" de tu inventario.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminar}
      />
    </>
  );
}

function ProductoForm({
  producto,
  onClose,
  update,
}: {
  producto?: InventoryProduct;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [nombre, setNombre] = React.useState(producto?.nombre ?? "");
  const [stock, setStock] = React.useState(String(producto?.stock ?? 1));
  const [minimo, setMinimo] = React.useState(String(producto?.minimo ?? 3));

  const puedeGuardar = nombre.trim().length > 1;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const b = prev.barberia!;
      if (producto) {
        return {
          ...prev,
          barberia: {
            ...b,
            productos: b.productos.map((p) =>
              p.id === producto.id ? { ...p, nombre: nombre.trim(), stock: Number(stock) || 0, minimo: Number(minimo) || 0 } : p
            ),
          },
        };
      }
      const nuevo = { id: uid("prod"), nombre: nombre.trim(), stock: Number(stock) || 0, minimo: Number(minimo) || 0 };
      return { ...prev, barberia: { ...b, productos: [nuevo, ...b.productos] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title={producto ? "Editar producto" : "Nuevo producto"} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Toallas" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{producto ? "Stock" : "Stock inicial"}</Label>
            <Input type="number" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Mínimo</Label>
            <Input type="number" inputMode="numeric" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
          </div>
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          {producto ? "Guardar cambios" : "Guardar producto"}
        </Button>
      </SheetFooter>
    </>
  );
}
