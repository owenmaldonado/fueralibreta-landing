"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/session";
import { formatMoney } from "@/lib/mock";
import type { Dish } from "@/lib/types";

const CATEGORIA_CHIPS = ["Platillo fuerte", "Entrada", "Bebida", "Postre"];

export default function MenuPage() {
  const { session, ready, update } = useSession();
  const [editando, setEditando] = React.useState<Dish | null>(null);
  const [borrando, setBorrando] = React.useState<Dish | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.fonda!;
  const categorias = Array.from(new Set(data.platillos.map((p) => p.categoria)));

  function toggle(id: string) {
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, platillos: f.platillos.map((p) => (p.id === id ? { ...p, activoHoy: !p.activoHoy } : p)) } };
    });
  }

  function eliminar() {
    if (!borrando) return;
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, platillos: f.platillos.filter((p) => p.id !== borrando.id) } };
    });
    setBorrando(null);
  }

  return (
    <>
      <PageHeader title="Menú" subtitle="Marca lo que hay disponible hoy" />
      <div className="flex flex-col gap-5 px-4 pb-6">
        {categorias.map((cat) => (
          <div key={cat}>
            <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">{cat}</p>
            <div className="flex flex-col gap-2">
              {data.platillos
                .filter((p) => p.categoria === cat)
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <label className="flex flex-1 items-center gap-3">
                      <Checkbox checked={p.activoHoy} onCheckedChange={() => toggle(p.id)} />
                      <span className={`flex-1 text-sm font-medium ${!p.activoHoy && "text-muted-foreground line-through"}`}>
                        {p.nombre}
                      </span>
                    </label>
                    <span className="font-mono text-sm text-muted-foreground">{formatMoney(p.precio)}</span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => setEditando(p)}
                        aria-label="Editar platillo"
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setBorrando(p)}
                        aria-label="Eliminar platillo"
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <PlatilloForm platillo={editando} onClose={() => setEditando(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar platillo"
        description={`Se borrará "${borrando?.nombre}" del catálogo.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminar}
      />
    </>
  );
}

function PlatilloForm({
  platillo,
  onClose,
  update,
}: {
  platillo: Dish;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [nombre, setNombre] = React.useState(platillo.nombre);
  const [precio, setPrecio] = React.useState(String(platillo.precio));
  const [categoria, setCategoria] = React.useState(platillo.categoria);

  const puedeGuardar = nombre.trim().length > 1 && Number(precio) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const f = prev.fonda!;
      return {
        ...prev,
        fonda: {
          ...f,
          platillos: f.platillos.map((p) =>
            p.id === platillo.id ? { ...p, nombre: nombre.trim(), precio: Number(precio), categoria } : p
          ),
        },
      };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Editar platillo" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Precio</Label>
          <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <ChipGroup>
            {CATEGORIA_CHIPS.map((c) => (
              <Chip key={c} selected={categoria === c} onClick={() => setCategoria(c)}>
                {c}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar cambios
        </Button>
      </SheetFooter>
    </>
  );
}
