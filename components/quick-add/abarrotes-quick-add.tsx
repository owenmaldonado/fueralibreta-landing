"use client";

import * as React from "react";
import { ShoppingCart, PackagePlus, HandCoins, Receipt } from "lucide-react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import type { FabAction } from "@/components/app-shell/fab";
import { uid, formatMoney, todayISO } from "@/lib/mock";
import type { TenantData, Expense } from "@/lib/types";

export const ABARROTES_ACTIONS: FabAction[] = [
  { key: "venta", label: "Nueva Venta", icon: <ShoppingCart className="h-4 w-4" /> },
  { key: "producto", label: "Producto", icon: <PackagePlus className="h-4 w-4" /> },
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
      <Sheet open={active === "fiado"} onOpenChange={(o) => !o && onClose()}>
        <NuevoFiadoForm onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "gasto"} onOpenChange={(o) => !o && onClose()}>
        <NuevoGastoForm onClose={onClose} update={update} />
      </Sheet>
    </>
  );
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
  const [productoId, setProductoId] = React.useState(data.productos[0]?.id ?? "");
  const [cantidad, setCantidad] = React.useState(1);

  const producto = data.productos.find((p) => p.id === productoId);
  const total = (producto?.precio ?? 0) * cantidad;
  const puedeGuardar = !!producto && cantidad > 0 && cantidad <= (producto?.stock ?? 0);

  function guardar() {
    if (!puedeGuardar || !producto) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const venta = {
        id: uid("sale"),
        productoId: producto.id,
        productoNombre: producto.nombre,
        cantidad,
        total,
        fecha: new Date().toISOString(),
      };
      const productos = a.productos.map((p) => (p.id === producto.id ? { ...p, stock: Math.max(0, p.stock - cantidad) } : p));
      return { ...prev, abarrotes: { ...a, ventas: [venta, ...a.ventas], productos } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nueva venta" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Producto</Label>
          <Select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            {data.productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · Stock {p.stock}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label>Cantidad</Label>
          <Stepper value={cantidad} onChange={setCantidad} min={1} max={producto?.stock ?? 99} />
        </div>
        <p className="text-right font-mono text-lg font-semibold">{formatMoney(total)}</p>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Registrar venta
        </Button>
      </SheetFooter>
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
