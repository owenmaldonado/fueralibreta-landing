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
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { uid, formatMoney, redondear2 } from "@/lib/mock";
import { usePlan } from "@/lib/planes";
import { camposEmpleado } from "@/lib/empleados";
import { encolarVentaPendiente } from "@/lib/offline-sales-queue";
import { lockBodyScroll } from "@/lib/scroll-lock";
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
  update: (fn: (prev: TenantData) => TenantData, opciones?: { ventaOffline?: boolean }) => void;
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
  const [pesoRapidoProducto, setPesoRapidoProducto] = React.useState<GroceryProduct | null>(null);

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
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [open, onClose]);

  // Frutas y Verdura (isVolatile) es Pro (ver app/app/frutas-verdura/page.tsx,
  // plan.giroAbarrotes.editor) — en básico esos productos no deben aparecer
  // como vendibles aquí: solo estorbarían en la grilla de venta sin poder
  // usarse (el panel donde sí se editan/ven ya está bloqueado con blur).
  const productosVendibles = React.useMemo(
    () => (plan.giroAbarrotes.editor ? data.productos : data.productos.filter((p) => !p.isVolatile)),
    [data, plan.giroAbarrotes.editor]
  );
  const productosOrdenados = React.useMemo(() => ordenarPorMasVendidos({ ...data, productos: productosVendibles }), [data, productosVendibles]);
  const categorias = React.useMemo(() => ["Todas", ...Array.from(new Set(productosVendibles.map((p) => p.categoria))).sort()], [productosVendibles]);
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

  /** Frutas y Verdura: agrega directo con el peso elegido en PesoRapidoSheet (sin el +0.5 fijo de agregarProducto), acumulando si el producto ya está en el carrito. */
  function agregarProductoConCantidad(p: GroceryProduct, cantidad: number) {
    if (p.stock <= 0) {
      toast.error(`${p.nombre} no tiene stock disponible`);
      return;
    }
    setCart((prev) => {
      const existente = prev.find((l) => l.productoId === p.id);
      if (existente) {
        return prev.map((l) => (l.productoId === p.id ? { ...l, cantidad: Math.min(l.cantidad + cantidad, p.stock) } : l));
      }
      return [
        ...prev,
        {
          productoId: p.id,
          productoNombre: p.nombre,
          cantidad: Math.min(cantidad, p.stock),
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
    const producto = productosVendibles.find((p) => p.codigo === codigo);
    if (!producto) {
      toast.error("No se encontró ningún producto con ese código");
      return;
    }
    agregarProducto(producto);
    toast.success(`${producto.nombre} agregado al carrito`);
  }

  const total = redondear2(cart.reduce((acc, l) => acc + redondear2(l.cantidad * l.precioUnitario), 0));
  const cantidadTotal = cart.reduce((acc, l) => acc + l.cantidad, 0);
  // Aquí había un tope de ventas por mes (plan.limiteAlcanzado(
  // "max_ventas_mes", ...), 100 en Básico) que DESHABILITABA el botón de
  // Cobrar. Se quita porque bloqueaba a clientes que pagan:
  //
  // - Una tiendita hace 50-200 ventas AL DÍA. El tope de 100 al mes se
  //   agota en los primeros dos días y de ahí al día 30 el negocio no
  //   podía cobrar NADA. No es un límite apretado, es la caja apagada.
  // - Ese número venía de PLANES (la tabla genérica y plana), no de
  //   LIMITES_ABARROTES, que es la que manda para este giro desde que los
  //   límites se separaron por giro — y ahí no existe ningún tope de
  //   ventas.
  // - Tampoco estaba anunciado: BENEFICIOS_POR_GIRO.abarrotes.basico dice
  //   "Hasta 200 productos / 1 cuenta / Gráfica semanal" y nada más. Se le
  //   cobraba a alguien un plan y luego se le apagaba la caja por un
  //   límite que nunca se le dijo.
  //
  // Barbería (maxCitas) y Fonda (maxPedidos) SÍ conservan su tope mensual:
  // esos viven en la tabla por giro, están anunciados en los beneficios y
  // 100 citas o 100 pedidos al mes sí es un volumen razonable para el giro.
  const puedeCobrar = cart.length > 0 && cart.every((l) => l.cantidad > 0);

  function cobrar() {
    if (!puedeCobrar) return;
    const ventaId = uid("sale");
    let ventaCreada: GrocerySale | null = null;
    let productosActualizados: GroceryProduct[] = [];
    let negocioId = "";
    update(
      (prev) => {
        const a = prev.abarrotes!;
        const venta: GrocerySale = {
          id: ventaId,
          items: cart.map((l) => ({
            id: uid("saleitem"),
            productoId: l.productoId ?? "",
            productoNombre: l.productoNombre,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
            subtotal: redondear2(l.cantidad * l.precioUnitario),
            // Snapshot del costo AL COBRAR — la ganancia de esta venta no debe
            // moverse si el costo del producto se edita después. "Venta
            // rápida" (sin productoId, no está en el inventario) no tiene
            // costo conocido: 0, se cuenta el precio completo como ganancia.
            costoUnitario: (l.productoId && a.productos.find((p) => p.id === l.productoId)?.costo) || 0,
          })),
          total,
          fecha: new Date().toISOString(),
          ...camposEmpleado(),
        };
        const productos = a.productos.map((p) => {
          const linea = cart.find((l) => l.productoId === p.id);
          return linea ? { ...p, stock: Math.max(0, p.stock - linea.cantidad) } : p;
        });
        ventaCreada = venta;
        productosActualizados = productos;
        negocioId = prev.business.id;
        return { ...prev, abarrotes: { ...a, ventas: [venta, ...a.ventas], productos } };
      },
      { ventaOffline: true }
    );
    // Sin red: además de aplicarse en memoria (arriba), queda en la cola
    // local para no perderse en un reload y para el contador del TopBar —
    // con stock ya descontado en el mismo caché, así no se puede vender dos
    // veces el mismo producto sin señal.
    if (typeof navigator !== "undefined" && !navigator.onLine && ventaCreada) {
      encolarVentaPendiente({
        id: ventaId,
        negocioId,
        tipo: "abarrotes_venta",
        payload: ventaCreada,
        productosActualizados,
        ...camposEmpleado(),
      }).catch((err) => console.error("No se pudo encolar la venta pendiente:", err));
    }
    onClose();
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {paso === "grid" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
              <h1 className="font-display text-lg font-bold">Nueva venta</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setScanning(true)} className="gap-1.5">
                <ScanLine className="h-5 w-5" /> Escanear
              </Button>
              <Button variant="secondary" onClick={() => setRapidaOpen(true)} className="gap-1.5">
                <Zap className="h-5 w-5" /> Venta rápida
              </Button>
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
                    onClick={() => (p.isVolatile ? setPesoRapidoProducto(p) : agregarProducto(p))}
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

      <PesoRapidoSheet
        producto={pesoRapidoProducto}
        onClose={() => setPesoRapidoProducto(null)}
        onAgregar={(cantidad) => {
          if (pesoRapidoProducto) agregarProductoConCantidad(pesoRapidoProducto, cantidad);
          setPesoRapidoProducto(null);
        }}
      />
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

const PESOS_RAPIDOS = [0.25, 0.5, 0.75, 1, 1.5, 2];

/** Frutas y Verdura: al tocar un producto por peso (isVolatile), en vez del
 * +0.5 fijo de agregarProducto, este bottom sheet deja elegir un peso común
 * de un toque o escribir uno exacto — sin click extra para confirmar el
 * preset. Solo se usa para productos isVolatile; el resto del flujo de venta
 * (piezas, abarrotes normales) no lo toca. */
function PesoRapidoSheet({
  producto,
  onClose,
  onAgregar,
}: {
  producto: GroceryProduct | null;
  onClose: () => void;
  onAgregar: (cantidad: number) => void;
}) {
  const [manual, setManual] = React.useState("");

  React.useEffect(() => {
    if (producto) setManual("");
  }, [producto]);

  const manualNum = Number(manual);
  const puedeAgregarManual = manual.trim() !== "" && !Number.isNaN(manualNum) && manualNum > 0;

  return (
    <Sheet open={!!producto} onOpenChange={(o) => !o && onClose()}>
      {producto && (
        <>
          <SheetHeader
            title={`${emojiProducto(producto)} ${producto.nombre}`}
            description={`${formatMoney(producto.precio)}/${producto.unidad}`}
            onClose={onClose}
          />
          <div className="grid grid-cols-3 gap-2">
            {PESOS_RAPIDOS.map((kg) => (
              <button
                key={kg}
                type="button"
                onClick={() => onAgregar(kg)}
                className="flex flex-col items-center gap-0.5 rounded-xl border border-border bg-card py-3 text-center transition-transform active:scale-95 hover:border-primary"
              >
                <span className="font-mono text-sm font-bold">{kg} {producto.unidad}</span>
                <span className="text-[10px] text-muted-foreground">{formatMoney(redondear2(kg * producto.precio))}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-1.5">
            <Label>Cantidad exacta ({producto.unidad})</Label>
            <div className="flex gap-2">
              <Input
                autoFocus
                type="text"
                inputMode="decimal"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder={`Ej. 0.350`}
                className="flex-1"
              />
              <Button disabled={!puedeAgregarManual} onClick={() => puedeAgregarManual && onAgregar(manualNum)}>
                Agregar
              </Button>
            </div>
            {puedeAgregarManual && (
              <p className="text-xs text-muted-foreground">Subtotal: {formatMoney(redondear2(manualNum * producto.precio))}</p>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
