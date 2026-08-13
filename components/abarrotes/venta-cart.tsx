"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ArrowLeft, X, ScanLine, Plus, Minus, Trash2, Zap, ShoppingCart } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChipGroup, Chip } from "@/components/ui/chip";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { uid, formatMoney } from "@/lib/mock";
import { usePlan } from "@/lib/planes";
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
  if (p.emoji) return p.emoji;
  if (p.unidad !== "pieza") return "⚖️";
  return EMOJI_POR_CATEGORIA[p.categoria] ?? "📦";
}

/** Todos los productos, ordenados por más vendidos (cantidad histórica) DESC. Sin ventas registradas caen al final, en su orden original. */
function ordenarPorMasVendidos(data: NonNullable<TenantData["abarrotes"]>): GroceryProduct[] {
  const cantidadPorProducto = new Map<string, number>();
  for (const venta of data.ventas) {
    for (const item of venta.items) {
      if (!item.productoId) continue;
      cantidadPorProducto.set(item.productoId, (cantidadPorProducto.get(item.productoId) ?? 0) + item.cantidad);
    }
  }
  return [...data.productos].sort((a, b) => (cantidadPorProducto.get(b.id) ?? 0) - (cantidadPorProducto.get(a.id) ?? 0));
}

interface CartLine {
  productoId: string | null;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  unidad: GroceryProduct["unidad"];
}

interface VentaCartProps {
  open: boolean;
  data: NonNullable<TenantData["abarrotes"]>;
  onClose: () => void;
  update: (fn: (prev: TenantData) => TenantData) => void;
}

/**
 * Pantalla completa de "Nueva Venta" (no un Sheet parcial): grid de todo el
 * inventario ordenado por más vendidos, con filtro por categoría — sin
 * buscador al inicio, tocar un producto lo agrega al carrito de inmediato.
 * Un segundo paso ("carrito") muestra el ticket para ajustar cantidades y
 * cobrar. Comparte esta pantalla el FAB (Nueva Venta) y el botón sticky de
 * /app/inventario.
 */
export function VentaCart({ open, data, onClose, update }: VentaCartProps) {
  const plan = usePlan();
  const [mounted, setMounted] = React.useState(false);
  const [paso, setPaso] = React.useState<"grid" | "carrito">("grid");
  const [categoria, setCategoria] = React.useState<string>("Todas");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [scanning, setScanning] = React.useState(false);
  const [rapidaOpen, setRapidaOpen] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (open) {
      setPaso("grid");
      setCategoria("Todas");
      setCart([]);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const productosOrdenados = React.useMemo(() => ordenarPorMasVendidos(data), [data]);
  const categorias = React.useMemo(() => ["Todas", ...Array.from(new Set(data.productos.map((p) => p.categoria))).sort()], [data]);
  const productosVisibles = categoria === "Todas" ? productosOrdenados : productosOrdenados.filter((p) => p.categoria === categoria);

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

  function cambiarCantidadDirecta(index: number, cantidad: number) {
    setCart((prev) => {
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
  const cantidadTotal = cart.reduce((acc, l) => acc + l.cantidad, 0);
  const ventasEsteMes = React.useMemo(() => {
    const ahora = new Date();
    return data.ventas.filter((v) => {
      const f = new Date(v.fecha);
      return f.getFullYear() === ahora.getFullYear() && f.getMonth() === ahora.getMonth();
    }).length;
  }, [data.ventas]);
  const tocoLimiteVentas = plan.limiteAlcanzado("max_ventas_mes", ventasEsteMes);
  const puedeCobrar = cart.length > 0 && cart.every((l) => l.cantidad > 0) && !tocoLimiteVentas;

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
          // Snapshot del costo AL COBRAR — la ganancia de esta venta no debe
          // moverse si el costo del producto se edita después. "Venta
          // rápida" (sin productoId, no está en el inventario) no tiene
          // costo conocido: 0, se cuenta el precio completo como ganancia.
          costoUnitario: (l.productoId && a.productos.find((p) => p.id === l.productoId)?.costo) || 0,
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

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {paso === "grid" ? (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <h1 className="font-display text-lg font-bold">Nueva venta</h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setScanning(true)}
                aria-label="Escanear"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ScanLine className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setRapidaOpen(true)}
                aria-label="Venta rápida"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Zap className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border-b border-border px-4 py-3">
            <ChipGroup className="flex-nowrap">
              {categorias.map((c) => (
                <Chip key={c} selected={categoria === c} onClick={() => setCategoria(c)}>
                  {c}
                </Chip>
              ))}
            </ChipGroup>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {productosVisibles.length === 0 ? (
              <p className="pt-10 text-center text-sm text-muted-foreground">Sin productos en esta categoría</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 pb-24">
                {productosVisibles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => agregarProducto(p)}
                    disabled={p.stock <= 0}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-3 text-center transition-transform active:scale-95 disabled:opacity-40"
                  >
                    <span className="text-3xl">{emojiProducto(p)}</span>
                    <span className="line-clamp-2 w-full text-sm font-medium leading-tight">{p.nombre}</span>
                    <span className="font-mono text-sm font-semibold text-primary">
                      {formatMoney(p.precio)}
                      {p.unidad !== "pieza" && `/${p.unidad}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="border-t border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button size="lg" className="w-full justify-between" onClick={() => setPaso("carrito")}>
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" /> Ver carrito · {cantidadTotal}
                </span>
                <span>{formatMoney(total)}</span>
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setPaso("grid")}
              aria-label="Regresar"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-display text-lg font-bold">Carrito</h1>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border">
                <p className="px-4 text-center text-sm text-muted-foreground">Tu carrito está vacío</p>
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
                            <CantidadPesoInput cantidad={l.cantidad} onChange={(n) => cambiarCantidadDirecta(i, n)} />
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
          </div>

          <div className="border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {tocoLimiteVentas && (
              <div className="mb-3 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-center">
                <p className="text-sm font-medium">
                  Llegaste al límite de {plan.limites.max_ventas_mes} ventas este mes de tu plan {plan.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Sube de plan desde /admin para vender sin límite.</p>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <span className="font-display text-xl font-bold">{formatMoney(total)}</span>
            </div>
            <Button size="lg" className="w-full" disabled={!puedeCobrar} onClick={cobrar}>
              Cobrar
            </Button>
          </div>
        </>
      )}

      {scanning && <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      <VentaRapidaDialog open={rapidaOpen} onClose={() => setRapidaOpen(false)} onAgregar={agregarRapido} />
    </div>,
    document.body
  );
}

/** Input de cantidad para productos por peso (kg/granel): permite borrar todo
 * y quedar en blanco mientras el cliente escribe, sin quitar la línea del
 * carrito ni forzarlo con flechitas de type="number". Solo propaga hacia
 * arriba números válidos (>0); al perder el foco, si quedó vacío o inválido,
 * regresa al último valor válido. */
function CantidadPesoInput({ cantidad, onChange }: { cantidad: number; onChange: (n: number) => void }) {
  const [texto, setTexto] = React.useState(String(cantidad));
  const [enfocado, setEnfocado] = React.useState(false);

  React.useEffect(() => {
    if (!enfocado) setTexto(String(cantidad));
  }, [cantidad, enfocado]);

  function handleChange(v: string) {
    setTexto(v);
    const n = Number(v);
    if (v.trim() !== "" && !Number.isNaN(n) && n > 0) onChange(n);
  }

  function handleBlur() {
    setEnfocado(false);
    const n = Number(texto);
    if (texto.trim() === "" || Number.isNaN(n) || n <= 0) setTexto(String(cantidad));
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder=""
      value={texto}
      onFocus={() => setEnfocado(true)}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      className="h-8 w-20 px-2 text-center text-xs"
    />
  );
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
