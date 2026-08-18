"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ScanLine, Plus, Pencil, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/dashboards/empty-state";
import { LimiteBar } from "@/components/dashboards/limite-bar";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { VentaCart } from "@/components/abarrotes/venta-cart";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { buscarEnCatalogoGlobal, aportarACatalogoGlobal, type CatalogoGlobalEntry } from "@/lib/catalogo-global";
import { formatMoney, todayISO, uid } from "@/lib/mock";
import { cn } from "@/lib/utils";
import type { GroceryProduct } from "@/lib/types";

export default function InventarioPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [q, setQ] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [ventaOpen, setVentaOpen] = React.useState(false);
  const [ajustar, setAjustar] = React.useState<GroceryProduct | null>(null);
  const [nuevoCodigo, setNuevoCodigo] = React.useState<string | null>(null);
  const [sugeridoGlobal, setSugeridoGlobal] = React.useState<CatalogoGlobalEntry | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<GroceryProduct | null>(null);
  const [borrando, setBorrando] = React.useState<GroceryProduct | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.abarrotes!;
  // Frutas y Verdura (isVolatile) tiene su propio panel de precios — no
  // duplicarlas aquí, aunque sí sigan siendo vendibles desde Nueva Venta.
  const productosInventario = data.productos.filter((p) => !p.isVolatile);
  const filtrados = productosInventario.filter(
    (p) => p.nombre.toLowerCase().includes(q.toLowerCase()) || p.codigo.includes(q)
  );
  const maxProductos = plan.giroAbarrotes.maxProductos;
  const tocoLimiteProductos = maxProductos !== null && productosInventario.length >= maxProductos;

  function handleScan(codigo: string) {
    setScanning(false);
    const producto = data.productos.find((p) => p.codigo === codigo);
    if (producto) {
      setAjustar(producto);
      return;
    }
    // No está en ESTE negocio — antes de pedirle al usuario que escriba el
    // nombre a mano, pregunta si algún otro negocio ya lo escaneó (ver
    // lib/catalogo-global.ts). Async y no bloqueante: el Sheet se abre de
    // una vez con el código; si la consulta llega, autocompleta encima.
    setNuevoCodigo(codigo);
    setSugeridoGlobal(null);
    buscarEnCatalogoGlobal(codigo).then(setSugeridoGlobal);
  }

  function eliminarProducto() {
    if (!borrando) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, productos: a.productos.filter((p) => p.id !== borrando.id) } };
    });
    setBorrando(null);
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
        subtitle={`${productosInventario.length} productos`}
        action={
          <Button size="sm" onClick={() => setScanning(true)}>
            <ScanLine className="h-4 w-4" /> Escanear
          </Button>
        }
      />

      <div className="flex items-center gap-2 px-4 pt-3 pb-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o código..." className="pl-9" />
        </div>
        <Button
          size="icon"
          variant="outline"
          onClick={() => setAddOpen(true)}
          disabled={tocoLimiteProductos}
          aria-label="Agregar producto"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <LimiteBar actual={productosInventario.length} max={maxProductos} etiqueta="productos" planLabel={plan.label} />

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

      {scanning && <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      <VentaCart open={ventaOpen} data={data} onClose={() => setVentaOpen(false)} update={update} />

      <Sheet open={!!ajustar} onOpenChange={(o) => !o && setAjustar(null)}>
        {ajustar && <AjustarStockForm producto={ajustar} onClose={() => setAjustar(null)} update={update} />}
      </Sheet>

      <Sheet
        open={!!nuevoCodigo}
        onOpenChange={(o) => {
          if (!o) {
            setNuevoCodigo(null);
            setSugeridoGlobal(null);
          }
        }}
      >
        {nuevoCodigo && (
          <ProductoForm
            codigo={nuevoCodigo}
            sugerido={sugeridoGlobal}
            onClose={() => {
              setNuevoCodigo(null);
              setSugeridoGlobal(null);
            }}
            update={update}
            limiteAlcanzado={tocoLimiteProductos}
          />
        )}
      </Sheet>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <ProductoForm codigo={null} onClose={() => setAddOpen(false)} update={update} />
      </Sheet>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <ProductoForm producto={editando} codigo={null} onClose={() => setEditando(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar producto"
        description={`Se borrará "${borrando?.nombre}" de tu inventario.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminarProducto}
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
  sugerido,
  onClose,
  update,
  limiteAlcanzado = false,
}: {
  producto?: GroceryProduct;
  codigo: string | null;
  /** Del catálogo global (ver lib/catalogo-global.ts) — otro negocio ya escaneó este código. Solo autocompleta nombre: marca/presentacion no tienen input en este formulario todavía. */
  sugerido?: CatalogoGlobalEntry | null;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
  /** Solo aplica al crear (no a editar un producto que ya existe) — ver plan.limiteAlcanzado("max_productos", ...) en el padre. */
  limiteAlcanzado?: boolean;
}) {
  const [nombre, setNombre] = React.useState(producto?.nombre ?? sugerido?.nombre ?? "");
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

  // sugerido llega async (consulta al catálogo global después de escanear,
  // ver handleScan en el padre) — puede resolver DESPUÉS de que este
  // formulario ya montó con nombre vacío. Solo autocompleta si el usuario
  // no había escrito nada todavía, para no pisarle lo que ya tecleó.
  React.useEffect(() => {
    if (sugerido && !producto && !nombre.trim()) {
      setNombre(sugerido.nombre);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a que llegue el sugerido, no a cada tecla en nombre
  }, [sugerido]);

  const utilidad = Number(precio || 0) - Number(costo || 0);
  const bloqueadoPorLimite = !producto && limiteAlcanzado;
  const puedeGuardar = nombre.trim().length > 1 && Number(precio) > 0 && !bloqueadoPorLimite;

  function guardar() {
    if (!puedeGuardar) return;
    const codigoFinal = codigoInput.trim() || Math.floor(1000000000 + Math.random() * 8999999999).toString();
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
        codigo: codigoFinal,
        minimo: 5,
        ...datos,
      };
      return { ...prev, abarrotes: { ...a, productos: [nuevo, ...a.productos] } };
    });
    // Producto NUEVO (no edición) -> aporta al catálogo global para el
    // siguiente negocio que escanee este mismo código. Fire-and-forget: ni
    // bloquea el cierre del Sheet ni muestra error si falla (ver
    // lib/catalogo-global.ts).
    if (!producto) {
      aportarACatalogoGlobal(codigoFinal, nombre);
    }
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
      {bloqueadoPorLimite && (
        <p className="text-xs text-destructive">
          Llegaste al límite de productos de tu plan —{" "}
          <Link href="/planes" className="underline">
            sube de plan
          </Link>{" "}
          para agregar más.
        </p>
      )}
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
