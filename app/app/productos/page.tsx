"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Stepper } from "@/components/ui/stepper";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { useSession } from "@/lib/session";
import { uid } from "@/lib/mock";
import { cn } from "@/lib/utils";

export default function ProductosPage() {
  const { session, ready, update } = useSession();
  const [addOpen, setAddOpen] = React.useState(false);

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
              <div>
                <p className="text-sm font-medium">{p.nombre}</p>
                <p className={cn("text-xs", bajo ? "font-medium text-primary" : "text-muted-foreground")}>
                  Stock {p.stock} · mínimo {p.minimo}
                </p>
              </div>
              <Stepper value={p.stock} onChange={(v) => ajustar(p.id, v - p.stock)} />
            </div>
          );
        })}
      </div>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <NuevoProductoForm onClose={() => setAddOpen(false)} update={update} />
      </Sheet>
    </>
  );
}

function NuevoProductoForm({ onClose, update }: { onClose: () => void; update: ReturnType<typeof useSession>["update"] }) {
  const [nombre, setNombre] = React.useState("");
  const [stock, setStock] = React.useState("1");
  const [minimo, setMinimo] = React.useState("3");

  const puedeGuardar = nombre.trim().length > 1;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const b = prev.barberia!;
      const producto = { id: uid("prod"), nombre: nombre.trim(), stock: Number(stock) || 0, minimo: Number(minimo) || 0 };
      return { ...prev, barberia: { ...b, productos: [producto, ...b.productos] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nuevo producto" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Toallas" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Stock inicial</Label>
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
          Guardar producto
        </Button>
      </SheetFooter>
    </>
  );
}
