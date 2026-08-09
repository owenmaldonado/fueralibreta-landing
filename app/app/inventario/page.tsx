"use client";

import * as React from "react";
import { Search, ScanLine, Plus, Minus, Pencil, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { StatTile } from "@/components/dashboards/stat-tile";
import { TrendBarChart } from "@/components/dashboards/trend-bar-chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboards/empty-state";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { VentaCart } from "@/components/abarrotes/venta-cart";
import { useSession } from "@/lib/session";
import { formatMoney, todayISO, uid } from "@/lib/mock";
import { aggregateByRange, type RangoTiempo } from "@/lib/chart-buckets";
import { cn } from "@/lib/utils";
import type { GroceryProduct, GrocerySale, GrocerySaleItem } from "@/lib/types";

const RANGO_TABS = [
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

/**
 * Ganancia = (precio_venta - precio_compra) * cantidad por línea vendida.
 * precio_compra se busca por el costo ACTUAL del producto (GrocerySaleItem
 * no guarda una foto del costo al momento de la venta) — si el costo de un
 * producto cambió desde entonces, la ganancia histórica de esa venta se
 * recalcula con el costo de hoy, no el de ese día. Para artículos de "venta
 * rápida" (sin productoId, no están en el inventario) no hay costo
 * conocido, así que se cuenta el precio completo como ganancia.
 */
function calcularGanancia(ventas: GrocerySale[], productos: GroceryProduct[]): { fecha: string; monto: number }[] {
  const costoPorProducto = new Map(productos.map((p) => [p.id, p.costo]));
  return ventas.map((v) => ({
    fecha: v.fecha,
    monto: v.items.reduce((acc, it) => {
      const costo = it.productoId ? costoPorProducto.get(it.productoId) ?? 0 : 0;
      return acc + (it.precioUnitario - costo) * it.cantidad;
    }, 0),
  }));
}

export default function InventarioPage() {
  const { session, ready, update } = useSession();
  const [tab, setTab] = React.useState("productos");
  const [q, setQ] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [ventaOpen, setVentaOpen] = React.useState(false);
  const [ajustar, setAjustar] = React.useState<GroceryProduct | null>(null);
  const [nuevoCodigo, setNuevoCodigo] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<GroceryProduct | null>(null);
  const [borrando, setBorrando] = React.useState<GroceryProduct | null>(null);
  const [editandoVenta, setEditandoVenta] = React.useState<GrocerySale | null>(null);
  const [borrandoVenta, setBorrandoVenta] = React.useState<GrocerySale | null>(null);
  const [rangoGanancia, setRangoGanancia] = React.useState<RangoTiempo>("semanal");

  if (!ready || !session) return <LoadingBlock />;

  const data = session.abarrotes!;
  const filtrados = data.productos.filter(
    (p) => p.nombre.toLowerCase().includes(q.toLowerCase()) || p.codigo.includes(q)
  );
  const ventas = [...data.ventas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const gananciaPorVenta = calcularGanancia(data.ventas, data.productos);
  const gananciaTotal = gananciaPorVenta.reduce((acc, g) => acc + g.monto, 0);
  const serieGanancia = aggregateByRange(gananciaPorVenta, rangoGanancia, (g) => g.fecha, (g) => g.monto);

  function handleScan(codigo: string) {
    setScanning(false);
    const producto = data.productos.find((p) => p.codigo === codigo);
    if (producto) {
      setAjustar(producto);
    } else {
      setNuevoCodigo(codigo);
    }
  }

  function eliminarProducto() {
    if (!borrando) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, productos: a.productos.filter((p) => p.id !== borrando.id) } };
    });
    setBorrando(null);
  }

  function eliminarVenta() {
    if (!borrandoVenta) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, ventas: a.ventas.filter((v) => v.id !== borrandoVenta.id) } };
    });
    setBorrandoVenta(null);
  }

  return (
    <>
      <div className="sticky top-14 z-10 bg-background px-4 pt-3">
        <button
          type="button"
          onClick={() => setVentaOpen(true)}
          className="flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold text-white shadow-lg transition-transform active:scale-[0.98]"
          style={{ backgroundColor: "#22c55e" }}
        >
          <Plus className="h-6 w-6" /> NUEVA VENTA
        </button>
      </div>

      <PageHeader
        title="Inventario"
        subtitle={`${data.productos.length} productos`}
        action={
          <Button size="sm" onClick={() => setScanning(true)}>
            <ScanLine className="h-4 w-4" /> Escanear
          </Button>
        }
      />

      <div className="px-4 pb-3">
        <Tabs
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: "productos", label: "Productos" },
            { value: "ventas", label: `Ventas · ${ventas.length}` },
          ]}
        />
      </div>

      {tab === "productos" ? (
        <>
          <div className="flex items-center gap-2 px-4 pb-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o código..." className="pl-9" />
            </div>
            <Button size="icon" variant="outline" onClick={() => setAddOpen(true)} aria-label="Agregar producto">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-2 px-4 pb-6">
            {filtrados.length === 0 ? (
              <EmptyState texto="Sin productos" />
            ) : (
              filtrados.map((p) => {
                const bajo = p.stock <= p.minimo;
                const utilidad = p.precio - p.costo;
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <button onClick={() => setAjustar(p)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.categoria} · {formatMoney(p.precio)} <span className="text-ledger">+{formatMoney(utilidad)}</span>
                        {p.controlCaducidad && " · con caducidad"}
                      </p>
                    </button>
                    <button onClick={() => setAjustar(p)} className={cn("shrink-0 font-mono text-sm", bajo ? "font-semibold text-primary" : "text-muted-foreground")}>
                      {p.stock}
                    </button>
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
              })
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 px-4 pb-6">
          <div className="mb-1">
            <StatTile label="Ganancia total" value={formatMoney(gananciaTotal)} />
          </div>
          <div className="mb-3 flex flex-col gap-3">
            <Tabs value={rangoGanancia} onValueChange={(v) => setRangoGanancia(v as RangoTiempo)} tabs={RANGO_TABS} />
            <TrendBarChart
              data={serieGanancia}
              bars={[{ key: "value", name: "Ganancia", color: "hsl(168 55% 45%)" }]}
              emptyText="Sin ventas en este periodo"
            />
          </div>
          {ventas.length === 0 ? (
            <EmptyState texto="Sin ventas registradas" />
          ) : (
            ventas.map((v) => {
              const resumen =
                v.items.length === 1
                  ? `${v.items[0].cantidad} ${v.items[0].productoNombre}`
                  : `${v.items.reduce((acc, it) => acc + it.cantidad, 0)} piezas · ${v.items.length} productos`;
              return (
              <div key={v.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{resumen}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.fecha).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm text-ledger">{formatMoney(v.total)}</span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => setEditandoVenta(v)}
                    aria-label="Editar venta"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setBorrandoVenta(v)}
                    aria-label="Eliminar venta"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              );
            })
          )}
        </div>
      )}

      {scanning && <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      <VentaCart open={ventaOpen} data={data} onClose={() => setVentaOpen(false)} update={update} />

      <Sheet open={!!ajustar} onOpenChange={(o) => !o && setAjustar(null)}>
        {ajustar && <AjustarStockForm producto={ajustar} onClose={() => setAjustar(null)} update={update} />}
      </Sheet>

      <Sheet open={!!nuevoCodigo} onOpenChange={(o) => !o && setNuevoCodigo(null)}>
        {nuevoCodigo && <ProductoForm codigo={nuevoCodigo} onClose={() => setNuevoCodigo(null)} update={update} />}
      </Sheet>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <ProductoForm codigo={null} onClose={() => setAddOpen(false)} update={update} />
      </Sheet>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <ProductoForm producto={editando} codigo={null} onClose={() => setEditando(null)} update={update} />}
      </Sheet>

      <Sheet open={!!editandoVenta} onOpenChange={(o) => !o && setEditandoVenta(null)}>
        {editandoVenta && <VentaForm venta={editandoVenta} onClose={() => setEditandoVenta(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar producto"
        description={`Se borrará "${borrando?.nombre}" de tu inventario.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminarProducto}
      />

      <ConfirmDialog
        open={!!borrandoVenta}
        title="Eliminar venta"
        description={`Se borrará esta venta por ${borrandoVenta ? formatMoney(borrandoVenta.total) : ""}. El stock no se ajusta automáticamente.`}
        onClose={() => setBorrandoVenta(null)}
        onConfirm={eliminarVenta}
      />
    </>
  );
}

function AjustarStockForm({
  producto,
  onClose,
  update,
}: {
  producto: GroceryProduct;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [stock, setStock] = React.useState(producto.stock);

  function guardar() {
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, productos: a.productos.map((p) => (p.id === producto.id ? { ...p, stock } : p)) } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title={producto.nombre} description={`Código ${producto.codigo}`} onClose={onClose} />
      <div className="flex flex-col items-center gap-4 py-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Stock actual</p>
        <Stepper value={stock} onChange={setStock} className="scale-125" />
      </div>
      <SheetFooter>
        <Button size="lg" onClick={guardar}>
          Guardar
        </Button>
      </SheetFooter>
    </>
  );
}

function ProductoForm({
  producto,
  codigo,
  onClose,
  update,
}: {
  producto?: GroceryProduct;
  codigo: string | null;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [nombre, setNombre] = React.useState(producto?.nombre ?? "");
  const [codigoInput, setCodigoInput] = React.useState(producto?.codigo ?? codigo ?? "");
  const [scanning, setScanning] = React.useState(false);
  const [categoria, setCategoria] = React.useState(producto?.categoria ?? "");
  const [emoji, setEmoji] = React.useState(producto?.emoji ?? "");
  const [costo, setCosto] = React.useState(String(producto?.costo ?? ""));
  const [precio, setPrecio] = React.useState(String(producto?.precio ?? ""));
  const [unidad, setUnidad] = React.useState<GroceryProduct["unidad"]>(producto?.unidad ?? "pieza");
  const [stock, setStock] = React.useState(String(producto?.stock ?? 1));
  const [controlCaducidad, setControlCaducidad] = React.useState(producto?.controlCaducidad ?? false);
  const [fechaCaducidad, setFechaCaducidad] = React.useState(producto?.lotes?.[0]?.fecha ?? todayISO(30));

  const utilidad = Number(precio || 0) - Number(costo || 0);
  const puedeGuardar = nombre.trim().length > 1 && Number(precio) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const datos = {
        nombre: nombre.trim(),
        categoria: categoria.trim() || "General",
        emoji: emoji.trim() || undefined,
        costo: Number(costo) || 0,
        precio: Number(precio),
        unidad,
        stock: Number(stock) || 0,
        controlCaducidad,
        lotes: controlCaducidad ? [{ cantidad: Number(stock) || 0, fecha: fechaCaducidad }] : [],
      };
      if (producto) {
        return { ...prev, abarrotes: { ...a, productos: a.productos.map((p) => (p.id === producto.id ? { ...p, ...datos } : p)) } };
      }
      const nuevo: GroceryProduct = {
        id: uid("gp"),
        codigo: codigoInput.trim() || Math.floor(1000000000 + Math.random() * 8999999999).toString(),
        minimo: 5,
        ...datos,
      };
      return { ...prev, abarrotes: { ...a, productos: [nuevo, ...a.productos] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title={producto ? "Editar producto" : "Nuevo producto"} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Sabritas 45g" />
        </div>
        <div className="space-y-1.5">
          <Label>Código de barras / SKU</Label>
          <div className="flex gap-2">
            <Input
              value={codigoInput}
              onChange={(e) => setCodigoInput(e.target.value)}
              placeholder="Escanéalo o escríbelo"
              className="flex-1"
            />
            <Button type="button" variant="outline" onClick={() => setScanning(true)}>
              <ScanLine className="h-4 w-4" /> Escanear
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej. Botanas" />
        </div>
        <div className="space-y-1.5">
          <Label>Emoji / Icono</Label>
          <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="Ej. 🥤 (opcional, si no hay se usa uno por categoría)" maxLength={4} />
        </div>
        <div className="space-y-1.5">
          <Label>Se vende por</Label>
          <ChipGroup>
            <Chip selected={unidad === "pieza"} onClick={() => setUnidad("pieza")}>
              Pieza
            </Chip>
            <Chip selected={unidad === "kg"} onClick={() => setUnidad("kg")}>
              Kg (peso)
            </Chip>
            <Chip selected={unidad === "granel"} onClick={() => setUnidad("granel")}>
              Granel
            </Chip>
          </ChipGroup>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Costo</Label>
            <Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$0" />
          </div>
          <div className="space-y-1.5">
            <Label>Precio venta {unidad !== "pieza" && `(por ${unidad})`}</Label>
            <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$0" />
          </div>
        </div>
        {(costo || precio) && (
          <p className="text-xs text-muted-foreground">
            Utilidad por {unidad === "pieza" ? "pieza" : unidad}: <span className="font-medium text-ledger">{formatMoney(utilidad)}</span>
          </p>
        )}
        <div className="space-y-1.5">
          <Label>Stock {unidad !== "pieza" && `(${unidad})`}</Label>
          <Input
            type="number"
            inputMode="decimal"
            step={unidad === "pieza" ? "1" : "0.001"}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
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
          {producto ? "Guardar cambios" : "Guardar producto"}
        </Button>
      </SheetFooter>
      {scanning && (
        <BarcodeScanner
          onScan={(code) => {
            setCodigoInput(code);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </>
  );
}

function VentaForm({
  venta,
  onClose,
  update,
}: {
  venta: GrocerySale;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [items, setItems] = React.useState<GrocerySaleItem[]>(venta.items);

  const total = items.reduce((acc, it) => acc + it.subtotal, 0);
  const puedeGuardar = items.length > 0;

  function cambiarCantidad(itemId: string, cantidad: number) {
    setItems((prev) =>
      cantidad <= 0
        ? prev.filter((it) => it.id !== itemId)
        : prev.map((it) => (it.id === itemId ? { ...it, cantidad, subtotal: cantidad * it.precioUnitario } : it))
    );
  }

  function quitar(itemId: string) {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  }

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return {
        ...prev,
        abarrotes: { ...a, ventas: a.ventas.map((v) => (v.id === venta.id ? { ...v, items, total } : v)) },
      };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Editar venta" description="El stock no se ajusta automáticamente" onClose={onClose} />
      <div className="flex flex-col gap-4">
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
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="max-w-[100px] whitespace-normal text-sm font-medium">{it.productoNombre}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(it.id, it.cantidad - 1)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary"
                      aria-label="Restar"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-4 text-center font-mono text-xs tabular-nums">{it.cantidad}</span>
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(it.id, it.cantidad + 1)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary"
                      aria-label="Sumar"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">{formatMoney(it.subtotal)}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => quitar(it.id)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="font-display text-xl font-bold">{formatMoney(total)}</span>
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
