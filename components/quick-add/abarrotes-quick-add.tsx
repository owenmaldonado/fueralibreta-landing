"use client";

import * as React from "react";
import { toast } from "sonner";
import { ShoppingCart, PackagePlus, HandCoins, Receipt, CalendarClock, Search, ScanLine, Plus, Minus, Trash2 } from "lucide-react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { BarcodeScanner } from "@/components/barcode-scanner";
import type { FabAction } from "@/components/app-shell/fab";
import { uid, formatMoney, todayISO } from "@/lib/mock";
import type { TenantData, Expense, GroceryProduct, GrocerySale, Apartado } from "@/lib/types";

export const ABARROTES_ACTIONS: FabAction[] = [
  { key: "venta", label: "Nueva Venta", icon: <ShoppingCart className="h-4 w-4" /> },
  { key: "producto", label: "Producto", icon: <PackagePlus className="h-4 w-4" /> },
  { key: "apartado", label: "Nuevo apartado", icon: <CalendarClock className="h-4 w-4" /> },
  { key: "fiado", label: "Fiado", icon: <HandCoins className="h-4 w-4" /> },
  { key: "gasto", label: "Gasto", icon: <Receipt className="h-4 w-4" /> },
];

interface Props {
  active: string | null;
  onClose: () => void;
  session: TenantData;
  update: (fn: (prev: TenantData) => TenantData) => void;
}

const GASTO_CHIPS = ["Renta", "Luz", "Agua", "Otro"];

export function AbarrotesQuickAdd({ active, onClose, session, update }: Props) {
  const data = session.abarrotes;
  if (!data) return null;

  return (
    <>
      <Sheet open={active === "venta"} onOpenChange={(o) => !o && onClose()}>
        <NuevaVentaForm data={data} onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "producto"} onOpenChange={(o) => !o && onClose()}>
        <NuevoProductoForm onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "apartado"} onOpenChange={(o) => !o && onClose()}>
        <NuevoApartadoForm onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "fiado"} onOpenChange={(o) => !o && onClose()}>
        <NuevoFiadoForm onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "gasto"} onOpenChange={(o) => !o && onClose()}>
        <NuevoGastoForm onClose={onClose} update={update} />
      </Sheet>
    </>
  );
}

interface CartLine {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
}

function NuevaVentaForm({
  data,
  onClose,
  update,
}: {
  data: NonNullable<TenantData["abarrotes"]>;
  onClose: () => void;
  update: Props["update"];
}) {
  const [query, setQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [scanning, setScanning] = React.useState(false);

  const resultados = query.trim()
    ? data.productos.filter((p) => p.nombre.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  function stockDisponible(productoId: string): number {
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
        if (existente.cantidad >= p.stock) {
          toast.error(`Solo hay ${p.stock} de ${p.nombre} en stock`);
          return prev;
        }
        return prev.map((l) => (l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...prev, { productoId: p.id, productoNombre: p.nombre, cantidad: 1, precioUnitario: p.precio }];
    });
    setQuery("");
  }

  function cambiarCantidad(productoId: string, cantidad: number) {
    const max = stockDisponible(productoId);
    setCart((prev) =>
      cantidad <= 0
        ? prev.filter((l) => l.productoId !== productoId)
        : prev.map((l) => (l.productoId === productoId ? { ...l, cantidad: Math.min(cantidad, max) } : l))
    );
  }

  function quitar(productoId: string) {
    setCart((prev) => prev.filter((l) => l.productoId !== productoId));
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
  const puedeCobrar = cart.length > 0;

  function cobrar() {
    if (!puedeCobrar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const venta: GrocerySale = {
        id: uid("sale"),
        items: cart.map((l) => ({
          id: uid("saleitem"),
          productoId: l.productoId,
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
        </div>

        {resultados.length > 0 && (
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
                  <p className="text-xs text-muted-foreground">Stock {p.stock} · {formatMoney(p.precio)}</p>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        )}

        {cart.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="px-4 text-center text-sm text-muted-foreground">Busca o escanea productos para agregarlos</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-center">Cant</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cart.map((l) => (
                <TableRow key={l.productoId}>
                  <TableCell className="max-w-[100px] whitespace-normal text-sm font-medium">{l.productoNombre}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(l.productoId, l.cantidad - 1)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary"
                        aria-label="Restar"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-4 text-center font-mono text-xs tabular-nums">{l.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(l.productoId, l.cantidad + 1)}
                        disabled={l.cantidad >= stockDisponible(l.productoId)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary disabled:opacity-30"
                        aria-label="Sumar"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatMoney(l.precioUnitario)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{formatMoney(l.cantidad * l.precioUnitario)}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => quitar(l.productoId)}
                      className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Quitar del carrito"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
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
    </>
  );
}

function NuevoProductoForm({ onClose, update }: { onClose: () => void; update: Props["update"] }) {
  const [nombre, setNombre] = React.useState("");
  const [categoria, setCategoria] = React.useState("");
  const [costo, setCosto] = React.useState("");
  const [precio, setPrecio] = React.useState("");
  const [stock, setStock] = React.useState("1");
  const [controlCaducidad, setControlCaducidad] = React.useState(false);
  const [fechaCaducidad, setFechaCaducidad] = React.useState(todayISO(30));

  const utilidad = Number(precio || 0) - Number(costo || 0);
  const puedeGuardar = nombre.trim().length > 1 && Number(costo) >= 0 && Number(precio) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const producto = {
        id: uid("gp"),
        nombre: nombre.trim(),
        codigo: Math.floor(1000000000 + Math.random() * 8999999999).toString(),
        categoria: categoria.trim() || "General",
        costo: Number(costo),
        precio: Number(precio),
        stock: Number(stock) || 0,
        minimo: 5,
        controlCaducidad,
        lotes: controlCaducidad ? [{ cantidad: Number(stock) || 0, fecha: fechaCaducidad }] : [],
      };
      return { ...prev, abarrotes: { ...a, productos: [producto, ...a.productos] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nuevo producto" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Sabritas 45g" />
        </div>
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej. Botanas" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Costo</Label>
            <Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$0" />
          </div>
          <div className="space-y-1.5">
            <Label>Precio venta</Label>
            <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$0" />
          </div>
        </div>
        {(costo || precio) && (
          <p className="text-xs text-muted-foreground">
            Utilidad por pieza: <span className="font-medium text-ledger">{formatMoney(utilidad)}</span>
          </p>
        )}
        <div className="space-y-1.5">
          <Label>Stock inicial</Label>
          <Input type="number" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Controlar caducidad</p>
            <p className="text-xs text-muted-foreground">Solo si es perecedero</p>
          </div>
          <Switch checked={controlCaducidad} onCheckedChange={setControlCaducidad} />
        </div>
        {controlCaducidad && (
          <div className="space-y-1.5">
            <Label>Fecha de caducidad del lote</Label>
            <Input type="date" value={fechaCaducidad} onChange={(e) => setFechaCaducidad(e.target.value)} />
          </div>
        )}
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar producto
        </Button>
      </SheetFooter>
    </>
  );
}

function NuevoFiadoForm({ onClose, update }: { onClose: () => void; update: Props["update"] }) {
  const [nombre, setNombre] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [monto, setMonto] = React.useState("");

  const puedeGuardar = nombre.trim().length > 1 && Number(monto) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const montoNum = Number(monto);
      const existente = a.fiados.find((f) => f.clienteNombre.toLowerCase() === nombre.trim().toLowerCase());
      let fiados;
      if (existente) {
        fiados = a.fiados.map((f) =>
          f.id === existente.id
            ? { ...f, saldo: f.saldo + montoNum, historial: [{ fecha: todayISO(0), monto: montoNum, tipo: "cargo" as const }, ...f.historial] }
            : f
        );
      } else {
        fiados = [
          {
            id: uid("fiado"),
            clienteNombre: nombre.trim(),
            telefono: telefono.trim(),
            saldo: montoNum,
            historial: [{ fecha: todayISO(0), monto: montoNum, tipo: "cargo" as const }],
          },
          ...a.fiados,
        ];
      }
      return { ...prev, abarrotes: { ...a, fiados } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nuevo fiado" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="331 000 0000" />
        </div>
        <div className="space-y-1.5">
          <Label>Monto</Label>
          <Input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0" />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar fiado
        </Button>
      </SheetFooter>
    </>
  );
}

function NuevoApartadoForm({ onClose, update }: { onClose: () => void; update: Props["update"] }) {
  const [clienteNombre, setClienteNombre] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [producto, setProducto] = React.useState("");
  const [total, setTotal] = React.useState("");
  const [abonado, setAbonado] = React.useState("");
  const [fechaLimite, setFechaLimite] = React.useState(todayISO(14));

  const puedeGuardar = clienteNombre.trim().length > 1 && producto.trim().length > 1 && Number(total) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const apartado: Apartado = {
        id: uid("apartado"),
        clienteNombre: clienteNombre.trim(),
        telefono: telefono.trim(),
        producto: producto.trim(),
        total: Number(total),
        abonado: Math.min(Number(total), Number(abonado) || 0),
        fechaLimite,
        entregado: false,
      };
      return { ...prev, abarrotes: { ...a, apartados: [apartado, ...a.apartados] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nuevo apartado" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Input autoFocus value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="331 000 0000" />
        </div>
        <div className="space-y-1.5">
          <Label>Producto</Label>
          <Input value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej. Despensa navideña" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Total</Label>
            <Input type="number" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="$0" />
          </div>
          <div className="space-y-1.5">
            <Label>Abono inicial</Label>
            <Input type="number" inputMode="decimal" value={abonado} onChange={(e) => setAbonado(e.target.value)} placeholder="$0" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Fecha límite</Label>
          <Input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar apartado
        </Button>
      </SheetFooter>
    </>
  );
}

function NuevoGastoForm({ onClose, update }: { onClose: () => void; update: Props["update"] }) {
  const [categoria, setCategoria] = React.useState(GASTO_CHIPS[0]);
  const [monto, setMonto] = React.useState("");
  const [fechaPago, setFechaPago] = React.useState(todayISO(0));
  const [recordatorio, setRecordatorio] = React.useState(true);

  const puedeGuardar = Number(monto) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const gasto: Expense = { id: uid("exp"), categoria, monto: Number(monto), fecha: fechaPago, recordatorio };
      return { ...prev, abarrotes: { ...a, gastos: [gasto, ...a.gastos] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nuevo gasto" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <ChipGroup>
            {GASTO_CHIPS.map((c) => (
              <Chip key={c} selected={categoria === c} onClick={() => setCategoria(c)}>
                {c}
              </Chip>
            ))}
          </ChipGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Monto</Label>
          <Input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0" />
        </div>
        <div className="space-y-1.5">
          <Label>Fecha de pago</Label>
          <Input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <p className="text-sm font-medium">Recordarme</p>
          <Switch checked={recordatorio} onCheckedChange={setRecordatorio} />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar gasto
        </Button>
      </SheetFooter>
    </>
  );
}
