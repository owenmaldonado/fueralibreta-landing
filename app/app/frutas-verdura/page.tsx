"use client";

import * as React from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { EmptyState } from "@/components/dashboards/empty-state";
import { BloqueoPlan } from "@/components/dashboards/bloqueo-plan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/session";
import { usePlan, PRECIOS_POR_GIRO } from "@/lib/planes";
import { uid, formatMoney } from "@/lib/mock";
import { cn } from "@/lib/utils";
import type { GroceryProduct } from "@/lib/types";

const EMOJIS_RAPIDOS = ["🍅", "🥑", "🥔", "🍌", "🍋", "🧅", "🥕", "🍎"];

/** Precio con centavos visibles ($18.50) — formatMoney redondea a entero y aquí sí importan los 50 centavos. */
function formatPrecio(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FrutasVerduraPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [addOpen, setAddOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<GroceryProduct | null>(null);
  const [precioRapido, setPrecioRapido] = React.useState<GroceryProduct | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.abarrotes!;
  const volatiles = data.productos.filter((p) => p.isVolatile);

  function cerrarForm() {
    setAddOpen(false);
    setEditando(null);
  }

  return (
    <>
      <PageHeader
        title="Frutas y Verdura"
        subtitle={`${volatiles.length} producto${volatiles.length === 1 ? "" : "s"}`}
        action={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-4 pb-6">
        {volatiles.length === 0 ? (
          <div className="col-span-2">
            <EmptyState texto="Sin frutas ni verduras todavía" />
          </div>
        ) : (
          volatiles.map((p) => (
            <div key={p.id} className="relative rounded-2xl border border-border bg-card p-4">
              <button
                type="button"
                onClick={() => setEditando(p)}
                aria-label="Editar producto"
                className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setPrecioRapido(p)} className="flex w-full flex-col items-center gap-1.5 pt-2 text-center">
                <span className="text-5xl leading-none">{p.emoji || "🥬"}</span>
                <span className="mt-1 truncate text-sm font-medium">{p.nombre}</span>
                <span className="font-display text-xl font-bold text-primary">{formatPrecio(p.precio)}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">por {p.unidad === "kg" ? "kg" : "pza"}</span>
              </button>
            </div>
          ))
        )}
      </div>

      <Sheet open={!!precioRapido} onOpenChange={(o) => !o && setPrecioRapido(null)}>
        {precioRapido && (
          <PrecioRapidoForm producto={precioRapido} onClose={() => setPrecioRapido(null)} update={update} editorDisponible={plan.giroAbarrotes.editor} />
        )}
      </Sheet>

      <Sheet open={addOpen || !!editando} onOpenChange={(o) => !o && cerrarForm()}>
        <ProductoVolatilForm producto={editando} onClose={cerrarForm} update={update} />
      </Sheet>
    </>
  );
}

function PrecioRapidoForm({
  producto,
  onClose,
  update,
  editorDisponible,
}: {
  producto: GroceryProduct;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
  editorDisponible: boolean;
}) {
  const [costo, setCosto] = React.useState(producto.costo);
  const [precio, setPrecio] = React.useState(producto.precio);

  function ajustar(setter: React.Dispatch<React.SetStateAction<number>>, delta: number) {
    setter((prev) => Math.max(0, Math.round((prev + delta) * 100) / 100));
  }

  const ganancia = precio - costo;

  function guardar() {
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, productos: a.productos.map((p) => (p.id === producto.id ? { ...p, costo, precio } : p)) } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title={`${producto.emoji || "🥬"} ${producto.nombre}`} description={`Precios por ${producto.unidad === "kg" ? "kilo" : "pieza"}`} onClose={onClose} />
      <div className="flex flex-col gap-5 py-2">
        {/* Básico VE el precio actual (por eso el bloqueo va aquí adentro, no
            en la lista/grid de fuera) pero no puede tocarlo: ni a mano ni con
            los botones rápidos — todo el bloque de edición queda detrás de
            un solo candado con blur, no uno separado por cada fila. */}
        <BloqueoPlan
          activo={editorDisponible}
          blur
          titulo="Editor de precios es Pro"
          texto={`Ajusta precios a mano o con ±$1 desde ${formatMoney(PRECIOS_POR_GIRO.abarrotes.pro)}/mes`}
        >
          <div className="flex flex-col gap-5">
            <div className="space-y-1.5">
              <Label>Precio compra (costo)</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={costo}
                onChange={(e) => setCosto(Math.max(0, Number(e.target.value) || 0))}
                disabled={!editorDisponible}
                className="h-12 text-center font-display text-xl font-semibold"
              />
              <div className="grid w-full grid-cols-4 gap-2 pt-1">
                <Button type="button" variant="outline" disabled={!editorDisponible} onClick={() => ajustar(setCosto, -1)}>
                  -$1
                </Button>
                <Button type="button" variant="outline" disabled={!editorDisponible} onClick={() => ajustar(setCosto, -0.5)}>
                  -$0.50
                </Button>
                <Button type="button" variant="outline" disabled={!editorDisponible} onClick={() => ajustar(setCosto, 0.5)}>
                  +$0.50
                </Button>
                <Button type="button" variant="outline" disabled={!editorDisponible} onClick={() => ajustar(setCosto, 1)}>
                  +$1
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Precio venta</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={precio}
                onChange={(e) => setPrecio(Math.max(0, Number(e.target.value) || 0))}
                disabled={!editorDisponible}
                className="h-16 w-full text-center font-display text-4xl font-bold"
              />
              <div className="grid w-full grid-cols-4 gap-2 pt-1">
                <Button type="button" variant="outline" size="lg" disabled={!editorDisponible} onClick={() => ajustar(setPrecio, -1)}>
                  -$1
                </Button>
                <Button type="button" variant="outline" size="lg" disabled={!editorDisponible} onClick={() => ajustar(setPrecio, -0.5)}>
                  -$0.50
                </Button>
                <Button type="button" variant="outline" size="lg" disabled={!editorDisponible} onClick={() => ajustar(setPrecio, 0.5)}>
                  +$0.50
                </Button>
                <Button type="button" variant="outline" size="lg" disabled={!editorDisponible} onClick={() => ajustar(setPrecio, 1)}>
                  +$1
                </Button>
              </div>
            </div>
          </div>
        </BloqueoPlan>

        <p className={cn("text-center text-sm font-medium", ganancia >= 0 ? "text-ledger" : "text-destructive")}>
          Ganancia: {formatPrecio(ganancia)} por {producto.unidad === "kg" ? "kilo" : "pieza"}
        </p>
      </div>
      <SheetFooter>
        <Button size="lg" variant="ledger" className="h-14 text-lg" disabled={!editorDisponible} onClick={guardar}>
          Guardar
        </Button>
      </SheetFooter>
    </>
  );
}

function ProductoVolatilForm({
  producto,
  onClose,
  update,
}: {
  producto: GroceryProduct | null;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [nombre, setNombre] = React.useState(producto?.nombre ?? "");
  const [emoji, setEmoji] = React.useState(producto?.emoji ?? "");
  const [unidad, setUnidad] = React.useState<"kg" | "pieza">(producto?.unidad === "pieza" ? "pieza" : "kg");
  const [costo, setCosto] = React.useState(String(producto?.costo ?? ""));
  const [precio, setPrecio] = React.useState(String(producto?.precio ?? ""));
  const [stock, setStock] = React.useState(String(producto?.stock ?? ""));
  const [confirmando, setConfirmando] = React.useState(false);

  const puedeGuardar = nombre.trim().length > 1 && Number(precio) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const datos = {
        nombre: nombre.trim(),
        emoji: emoji.trim() || undefined,
        unidad,
        costo: Number(costo) || 0,
        precio: Number(precio),
        stock: Number(stock) || 0,
        isVolatile: true as const,
      };
      if (producto) {
        return { ...prev, abarrotes: { ...a, productos: a.productos.map((p) => (p.id === producto.id ? { ...p, ...datos } : p)) } };
      }
      const nuevo: GroceryProduct = {
        id: uid("gp"),
        codigo: Math.floor(1000000000 + Math.random() * 8999999999).toString(),
        categoria: "Frutas y Verdura",
        minimo: 0,
        controlCaducidad: false,
        lotes: [],
        ...datos,
      };
      return { ...prev, abarrotes: { ...a, productos: [nuevo, ...a.productos] } };
    });
    onClose();
  }

  function eliminar() {
    if (!producto) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, productos: a.productos.filter((p) => p.id !== producto.id) } };
    });
    setConfirmando(false);
    onClose();
  }

  return (
    <>
      <SheetHeader title={producto ? "Editar producto" : "Nueva fruta o verdura"} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Jitomate" />
        </div>
        <div className="space-y-1.5">
          <Label>Emoji</Label>
          <ChipGroup>
            {EMOJIS_RAPIDOS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border text-xl transition-colors",
                  emoji === e ? "border-primary bg-primary/15" : "border-border hover:border-primary/40"
                )}
              >
                {e}
              </button>
            ))}
          </ChipGroup>
          <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="O escribe otro emoji" maxLength={4} className="mt-1" />
        </div>
        <div className="space-y-1.5">
          <Label>Se vende por</Label>
          <ChipGroup>
            <Chip selected={unidad === "kg"} onClick={() => setUnidad("kg")}>
              Kilo
            </Chip>
            <Chip selected={unidad === "pieza"} onClick={() => setUnidad("pieza")}>
              Pieza
            </Chip>
          </ChipGroup>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Precio compra</Label>
            <Input type="number" inputMode="decimal" step="0.5" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$0" />
          </div>
          <div className="space-y-1.5">
            <Label>Precio venta</Label>
            <Input type="number" inputMode="decimal" step="0.5" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$0" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Stock ({unidad === "kg" ? "kilos disponibles" : "piezas"})</Label>
          <Input type="number" inputMode="decimal" step={unidad === "kg" ? "0.1" : "1"} value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
        {producto && (
          <Button
            type="button"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmando(true)}
          >
            <Trash2 className="h-4 w-4" /> Eliminar producto
          </Button>
        )}
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          {producto ? "Guardar cambios" : "Guardar"}
        </Button>
      </SheetFooter>

      {producto && (
        <ConfirmDialog
          open={confirmando}
          title="Eliminar producto"
          description={`Se borrará "${producto.nombre}" del panel de Frutas y Verdura.`}
          onClose={() => setConfirmando(false)}
          onConfirm={eliminar}
        />
      )}
    </>
  );
}
