"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Stepper } from "@/components/ui/stepper";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/session";
import { uid, formatMoney } from "@/lib/mock";
import { cn } from "@/lib/utils";
import type { InventoryProduct } from "@/lib/types";

export default function ProductosPage() {
  const { session, ready, update } = useSession();
  const [addOpen, setAddOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<InventoryProduct | null>(null);
  const [borrando, setBorrando] = React.useState<InventoryProduct | null>(null);
  const [seleccionados, setSeleccionados] = React.useState<Set<string>>(new Set());
  const [borrandoSeleccion, setBorrandoSeleccion] = React.useState(false);

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
    setSeleccionados((prev) => {
      if (!prev.has(borrando.id)) return prev;
      const next = new Set(prev);
      next.delete(borrando.id);
      return next;
    });
    setBorrando(null);
  }

  function toggleSeleccion(id: string, checked: boolean) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function eliminarSeleccionados() {
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, productos: b.productos.filter((p) => !seleccionados.has(p.id)) } };
    });
    setSeleccionados(new Set());
    setBorrandoSeleccion(false);
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
      <div className={cn("flex flex-col gap-2 px-4", seleccionados.size > 0 ? "pb-24" : "pb-6")}>
        {data.productos.map((p) => (
          <ProductoRow
            key={p.id}
            producto={p}
            seleccionado={seleccionados.has(p.id)}
            onToggleSeleccion={(checked) => toggleSeleccion(p.id, checked)}
            onEdit={() => setEditando(p)}
            onDeleteRequest={() => setBorrando(p)}
            ajustarStock={(delta) => ajustar(p.id, delta)}
          />
        ))}
      </div>

      {seleccionados.size > 0 && (
        // z-50: por encima de BottomNav (z-40) — mientras hay selección activa,
        // esta barra reemplaza visualmente al nav en vez de competir con él por
        // los taps (cancelar selección lo regresa).
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.15)]">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <button
              type="button"
              onClick={() => setSeleccionados(new Set())}
              aria-label="Cancelar selección"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <Button size="lg" variant="destructive" className="flex-1" onClick={() => setBorrandoSeleccion(true)}>
              <Trash2 className="h-4 w-4" />
              Eliminar {seleccionados.size} seleccionado{seleccionados.size === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <ProductoForm onClose={() => setAddOpen(false)} update={update} />
      </Sheet>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <ProductoForm producto={editando} onClose={() => setEditando(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar producto"
        description={`¿Seguro? Se borrará "${borrando?.nombre}" de tu inventario.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminar}
      />

      <ConfirmDialog
        open={borrandoSeleccion}
        title="Eliminar productos"
        description={`¿Seguro? Se borrarán ${seleccionados.size} producto${seleccionados.size === 1 ? "" : "s"} de tu inventario.`}
        onClose={() => setBorrandoSeleccion(false)}
        onConfirm={eliminarSeleccionados}
      />
    </>
  );
}

const SWIPE_MAX = 80;
const SWIPE_ABRIR = 40;

/**
 * Fila con swipe a la izquierda (arrastra el contenido y revela un botón
 * rojo de eliminar detrás, estilo iOS Mail) además del botón de papelera
 * de siempre — dos formas de llegar al mismo ConfirmDialog del padre, para
 * que nunca se borre nada sin confirmar así sea por swipe o por tap.
 */
function ProductoRow({
  producto,
  seleccionado,
  onToggleSeleccion,
  onEdit,
  onDeleteRequest,
  ajustarStock,
}: {
  producto: InventoryProduct;
  seleccionado: boolean;
  onToggleSeleccion: (checked: boolean) => void;
  onEdit: () => void;
  onDeleteRequest: () => void;
  ajustarStock: (delta: number) => void;
}) {
  const [offset, setOffset] = React.useState(0);
  const [arrastrando, setArrastrando] = React.useState(false);
  const startX = React.useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    setArrastrando(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null) return;
    const diff = e.touches[0].clientX - startX.current;
    if (diff <= 0) setOffset(Math.max(diff, -SWIPE_MAX));
  }

  function onTouchEnd() {
    startX.current = null;
    setArrastrando(false);
    setOffset((o) => (o <= -SWIPE_ABRIR ? -SWIPE_MAX : 0));
  }

  const bajo = producto.stock <= producto.minimo;

  return (
    <div className="relative overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => {
          setOffset(0);
          onDeleteRequest();
        }}
        aria-label="Eliminar producto"
        style={{ width: SWIPE_MAX }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-destructive-foreground"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => offset !== 0 && setOffset(0)}
        style={{ transform: `translateX(${offset}px)` }}
        className={cn(
          "relative flex items-center gap-2.5 rounded-xl border border-border bg-card p-3",
          !arrastrando && "transition-transform duration-200"
        )}
      >
        <Checkbox checked={seleccionado} onCheckedChange={onToggleSeleccion} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{producto.nombre}</p>
          <p className={cn("text-xs", bajo ? "font-medium text-primary" : "text-muted-foreground")}>
            Stock {producto.stock} · mínimo {producto.minimo}
            {producto.eliminarEnCero && " · auto-elimina en 0"}
          </p>
        </div>
        <Stepper value={producto.stock} onChange={(v) => ajustarStock(v - producto.stock)} />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={onEdit}
            aria-label="Editar producto"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDeleteRequest}
            aria-label="Eliminar producto"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
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
  const [eliminarEnCero, setEliminarEnCero] = React.useState(producto?.eliminarEnCero ?? false);
  const [precio, setPrecio] = React.useState(producto?.precio != null ? String(producto.precio) : "");
  const [costo, setCosto] = React.useState(producto?.costo != null ? String(producto.costo) : "");

  const puedeGuardar = nombre.trim().length > 1;

  // Vacío = "no aplica", no cero: un producto de uso interno (toallas,
  // navajas) sin precio no debe aparecer para vender, y uno sin costo no
  // debe reportar 100% de margen — se distingue con undefined, no con 0.
  function aNumeroOpcional(v: string): number | undefined {
    const t = v.trim();
    if (t === "") return undefined;
    const n = Number(t);
    return isNaN(n) || n < 0 ? undefined : n;
  }

  function guardar() {
    if (!puedeGuardar) return;
    const campos = {
      nombre: nombre.trim(),
      stock: Number(stock) || 0,
      minimo: Number(minimo) || 0,
      eliminarEnCero,
      precio: aNumeroOpcional(precio),
      costo: aNumeroOpcional(costo),
    };
    update((prev) => {
      const b = prev.barberia!;
      if (producto) {
        return {
          ...prev,
          barberia: { ...b, productos: b.productos.map((p) => (p.id === producto.id ? { ...p, ...campos } : p)) },
        };
      }
      return { ...prev, barberia: { ...b, productos: [{ id: uid("prod"), ...campos }, ...b.productos] } };
    });
    onClose();
  }

  const margen = aNumeroOpcional(precio) != null && aNumeroOpcional(costo) != null ? aNumeroOpcional(precio)! - aNumeroOpcional(costo)! : null;

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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Me cuesta</Label>
            <Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$0" />
          </div>
          <div className="space-y-1.5">
            <Label>Lo vendo en</Label>
            <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$0" />
          </div>
        </div>
        <p className="-mt-2 px-1 text-xs text-muted-foreground">
          {margen != null ? (
            <>
              Ganas <span className="font-medium text-ledger">{formatMoney(margen)}</span> por cada uno que vendas.
            </>
          ) : (
            "Déjalos vacíos si es de uso interno (toallas, navajas) y no lo vendes."
          )}
        </p>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Auto-eliminar cuando llegue a 0</p>
            <p className="text-xs text-muted-foreground">En vez de dejarlo en stock 0</p>
          </div>
          <Switch checked={eliminarEnCero} onCheckedChange={setEliminarEnCero} />
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
