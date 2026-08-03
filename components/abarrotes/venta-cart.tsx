"use client";

import * as React from "react";
import { toast } from "sonner";
import { Search, ScanLine, Plus, Minus, Trash2, Zap } from "lucide-react";

import { SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { uid, formatMoney } from "@/lib/mock";
import type { TenantData, GroceryProduct, GrocerySale } from "@/lib/types";

const EMOJI_POR_CATEGORIA: Record<string, string> = {
  Bebidas: "🥤",
  Lácteos: "🥛",
  Panadería: "🍞",
  Abarrotes: "🛒",
  Botanas: "🍟",
  Frutas: "🍎",
  Verduras: "🥬",
  Carnes: "🥩",
  Limpieza: "🧴",
  Dulces: "🍬",
};

function emojiProducto(p: GroceryProduct): string {
  if (p.unidad !== "pieza") return "⚖️";
  return EMOJI_POR_CATEGORIA[p.categoria] ?? "📦";
}

interface CartLine {
  productoId: string | null;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  unidad: GroceryProduct["unidad"];
}

interface VentaCartProps {
  data: NonNullable<TenantData["abarrotes"]>;
  onClose: () => void;
  update: (fn: (prev: TenantData) => TenantData) => void;
}

/**
 * Carrito de venta compartido entre el FAB (Nueva Venta) y el botón sticky
 * de /app/inventario. Soporta productos del catálogo (con o sin peso),
 * artículos sueltos que no están en inventario ("venta rápida"), y un grid
 * de los más vendidos para no tener que escribir nada.
 */
export function VentaCart({ data, onClose, update }: VentaCartProps) {
  const [query, setQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [scanning, setScanning] = React.useState(false);
  const [rapidaOpen, setRapidaOpen] = React.useState(false);

  const resultados = query.trim()
    ? data.productos.filter((p) => p.nombre.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  const masVendidos = React.useMemo(() => topDoceProductos(data), [data]);

  function stockDisponible(productoId: string | null): number {
    if (!productoId) return Infinity;
    return data.productos.find((p) => p.id === productoId)?.stock ?? 0;
  }

  function agregarProducto(p: GroceryProduct) {
    if (p.stock <= 0) {
      toast.error(`${p.nombre} no tiene stock disponible`);
      return;
    }
    setCart((prev) => {
      const existente = prev.find((l) => l.productoId === p.id);
      if (existente) {
        if (p.unidad === "pieza" && existente.cantidad >= p.stock) {
          toast.error(`Solo hay ${p.stock} de ${p.nombre} en stock`);
          return prev;
        }
        return prev.map((l) => (l.productoId === p.id ? { ...l, cantidad: l.cantidad + (p.unidad === "pieza" ? 1 : 0.5) } : l));
      }
      return [
        ...prev,
        {
          productoId: p.id,
          productoNombre: p.nombre,
          cantidad: p.unidad === "pieza" ? 1 : 0.5,
          precioUnitario: p.precio,
          unidad: p.unidad,
        },
      ];
    });
    setQuery("");
  }

  function agregarRapido(nombre: string, precio: number) {
    setCart((prev) => [
      ...prev,
      { productoId: null, productoNombre: nombre, cantidad: 1, precioUnitario: precio, unidad: "pieza" },
    ]);
    setRapidaOpen(false);
  }

  function cambiarCantidad(index: number, cantidad: number) {
    setCart((prev) => {
      if (cantidad <= 0) return prev.filter((_, i) => i !== index);
      const linea = prev[index];
      const max = stockDisponible(linea.productoId);
      return prev.map((l, i) => (i === index ? { ...l, cantidad: Math.min(cantidad, max) } : l));
    });
  }

  function quitar(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function handleScan(codigo: string) {
    setScanning(false);
    const producto = data.productos.find((p) => p.codigo === codigo);
    if (!producto) {
      toast.error("No se encontró ningún producto con ese código");
      return;
    }
    agregarProducto(producto);
    toast.success(`${producto.nombre} agregado al carrito`);
  }

  const total = cart.reduce((acc, l) => acc + l.cantidad * l.precioUnitario, 0);
  const puedeCobrar = cart.length > 0 && cart.every((l) => l.cantidad > 0);

  function cobrar() {
    if (!puedeCobrar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const venta: GrocerySale = {
        id: uid("sale"),
        items: cart.map((l) => ({
          id: uid("saleitem"),
          productoId: l.productoId ?? "",
          productoNombre: l.productoNombre,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          subtotal: l.cantidad * l.precioUnitario,
        })),
        total,
        fecha: new Date().toISOString(),
      };
      const productos = a.productos.map((p) => {
        const linea = cart.find((l) => l.productoId === p.id);
        return linea ? { ...p, stock: Math.max(0, p.stock - linea.cantidad) } : p;
      });
      return { ...prev, abarrotes: { ...a, ventas: [venta, ...a.ventas], productos } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nueva venta" onClose={onClose} />
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto..."
              className="pl-9"
            />
          </div>
          <Button type="button" size="icon" variant="outline" onClick={() => setScanning(true)} aria-label="Escanear">
            <ScanLine className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" onClick={() => setRapidaOpen(true)} aria-label="Venta rápida">
            <Zap className="h-4 w-4" />
          </Button>
        </div>

        {query.trim() ? (
          resultados.length > 0 && (
            <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
              {resultados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarProducto(p)}
                  disabled={p.stock <= 0}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      Stock {p.stock} · {formatMoney(p.precio)}
                      {p.unidad !== "pieza" && `/${p.unidad}`}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 shrink-0 text-primary" />
                </button>
              ))}
            </div>
          )
        ) : masVendidos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {masVendidos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => agregarProducto(p)}
                disabled={p.stock <= 0}
                className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2.5 text-center transition-colors hover:bg-secondary disabled:opacity-40"
              >
                <span className="text-2xl">{emojiProducto(p)}</span>
                <span className="w-full truncate text-[11px] font-medium">{p.nombre}</span>
                <span className="font-mono text-[11px] text-primary">
                  {formatMoney(p.precio)}
                  {p.unidad !== "pieza" && `/${p.unidad}`}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {cart.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="px-4 text-center text-sm text-muted-foreground">Busca, escanea o toca un producto para agregarlo</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-center">Cant</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cart.map((l, i) => {
                const esPeso = l.unidad !== "pieza";
                return (
                  <TableRow key={i}>
                    <TableCell className="max-w-[120px] whitespace-normal text-sm font-medium">
                      {l.productoNombre}
                      {esPeso && (
                        <p className="text-[10px] font-normal text-muted-foreground">
                          {formatMoney(l.precioUnitario)}/{l.unidad} x {l.cantidad.toFixed(3)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {esPeso ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          min="0"
                          value={l.cantidad}
                          onChange={(e) => cambiarCantidad(i, Number(e.target.value) || 0)}
                          className="h-8 w-20 px-2 text-center text-xs"
                        />
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(i, l.cantidad - 1)}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary"
                            aria-label="Restar"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-4 text-center font-mono text-xs tabular-nums">{l.cantidad}</span>
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(i, l.cantidad + 1)}
                            disabled={l.cantidad >= stockDisponible(l.productoId)}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary disabled:opacity-30"
                            aria-label="Sumar"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {formatMoney(l.cantidad * l.precioUnitario)}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => quitar(i)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Quitar del carrito"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="font-display text-xl font-bold">{formatMoney(total)}</span>
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeCobrar} onClick={cobrar}>
          Cobrar
        </Button>
      </SheetFooter>

      {scanning && <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      <VentaRapidaDialog open={rapidaOpen} onClose={() => setRapidaOpen(false)} onAgregar={agregarRapido} />
    </>
  );
}

function topDoceProductos(data: NonNullable<TenantData["abarrotes"]>): GroceryProduct[] {
  const cantidadPorProducto = new Map<string, number>();
  for (const venta of data.ventas) {
    for (const item of venta.items) {
      if (!item.productoId) continue;
      cantidadPorProducto.set(item.productoId, (cantidadPorProducto.get(item.productoId) ?? 0) + item.cantidad);
    }
  }
  const conVentas = data.productos
    .filter((p) => cantidadPorProducto.has(p.id))
    .sort((a, b) => (cantidadPorProducto.get(b.id) ?? 0) - (cantidadPorProducto.get(a.id) ?? 0));
  if (conVentas.length > 0) return conVentas.slice(0, 12);
  return data.productos.slice(0, 12);
}

function VentaRapidaDialog({
  open,
  onClose,
  onAgregar,
}: {
  open: boolean;
  onClose: () => void;
  onAgregar: (nombre: string, precio: number) => void;
}) {
  const [nombre, setNombre] = React.useState("");
  const [precio, setPrecio] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setNombre("");
      setPrecio("");
    }
  }, [open]);

  const puedeAgregar = nombre.trim().length > 0 && Number(precio) > 0;

  function agregar() {
    if (!puedeAgregar) return;
    onAgregar(nombre.trim(), Number(precio));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader title="Venta rápida" description="Para algo que no está en tu inventario" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Bolsa de hielo" />
        </div>
        <div className="space-y-1.5">
          <Label>Precio</Label>
          <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$0" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={!puedeAgregar} onClick={agregar}>
          Agregar al carrito
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
