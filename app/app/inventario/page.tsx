"use client";

import * as React from "react";
import { Search, ScanLine, Plus } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { EmptyState } from "@/components/dashboards/empty-state";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { useSession } from "@/lib/session";
import { formatMoney, todayISO, uid } from "@/lib/mock";
import { cn } from "@/lib/utils";
import type { GroceryProduct } from "@/lib/types";

export default function InventarioPage() {
  const { session, ready, update } = useSession();
  const [q, setQ] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [ajustar, setAjustar] = React.useState<GroceryProduct | null>(null);
  const [nuevoCodigo, setNuevoCodigo] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.abarrotes!;
  const filtrados = data.productos.filter(
    (p) => p.nombre.toLowerCase().includes(q.toLowerCase()) || p.codigo.includes(q)
  );

  function handleScan(codigo: string) {
    setScanning(false);
    const producto = data.productos.find((p) => p.codigo === codigo);
    if (producto) {
      setAjustar(producto);
    } else {
      setNuevoCodigo(codigo);
    }
  }

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle={`${data.productos.length} productos`}
        action={
          <Button size="sm" onClick={() => setScanning(true)}>
            <ScanLine className="h-4 w-4" /> Escanear
          </Button>
        }
      />
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
              <button
                key={p.id}
                onClick={() => setAjustar(p)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.categoria} · {formatMoney(p.precio)}{" "}
                    <span className="text-ledger">+{formatMoney(utilidad)}</span>
                    {p.controlCaducidad && " · con caducidad"}
                  </p>
                </div>
                <span className={cn("shrink-0 font-mono text-sm", bajo ? "font-semibold text-primary" : "text-muted-foreground")}>
                  {p.stock}
                </span>
              </button>
            );
          })
        )}
      </div>

      {scanning && <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      <Sheet open={!!ajustar} onOpenChange={(o) => !o && setAjustar(null)}>
        {ajustar && <AjustarStockForm producto={ajustar} onClose={() => setAjustar(null)} update={update} />}
      </Sheet>

      <Sheet open={!!nuevoCodigo} onOpenChange={(o) => !o && setNuevoCodigo(null)}>
        {nuevoCodigo && (
          <NuevoProductoForm codigo={nuevoCodigo} onClose={() => setNuevoCodigo(null)} update={update} />
        )}
      </Sheet>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <NuevoProductoForm codigo={null} onClose={() => setAddOpen(false)} update={update} />
      </Sheet>
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

function NuevoProductoForm({
  codigo,
  onClose,
  update,
}: {
  codigo: string | null;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [nombre, setNombre] = React.useState("");
  const [categoria, setCategoria] = React.useState("");
  const [costo, setCosto] = React.useState("");
  const [precio, setPrecio] = React.useState("");
  const [stock, setStock] = React.useState("1");
  const [controlCaducidad, setControlCaducidad] = React.useState(false);
  const [fechaCaducidad, setFechaCaducidad] = React.useState(todayISO(30));

  const utilidad = Number(precio || 0) - Number(costo || 0);
  const puedeGuardar = nombre.trim().length > 1 && Number(precio) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const producto: GroceryProduct = {
        id: uid("gp"),
        nombre: nombre.trim(),
        codigo: codigo ?? Math.floor(1000000000 + Math.random() * 8999999999).toString(),
        categoria: categoria.trim() || "General",
        costo: Number(costo) || 0,
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
      <SheetHeader
        title="Nuevo producto"
        description={codigo ? `Código escaneado: ${codigo}` : "Sin escanear"}
        onClose={onClose}
      />
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
