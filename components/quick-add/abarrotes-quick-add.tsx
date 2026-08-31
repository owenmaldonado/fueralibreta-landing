"use client";

import * as React from "react";
import { ShoppingCart, PackagePlus, HandCoins, Receipt, ScanLine } from "lucide-react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { VentaCart } from "@/components/abarrotes/venta-cart";
import { BarcodeScanner } from "@/components/barcode-scanner";
import type { FabAction } from "@/components/app-shell/fab";
import { uid, formatMoney, todayISO } from "@/lib/mock";
import { camposEmpleado } from "@/lib/empleados";
import { useHoy } from "@/lib/use-hoy";
import type { TenantData, Expense, GroceryProduct } from "@/lib/types";

// "Nuevo apartado" ya no vive aquí — Frutas y Verdura (tab propio en
// bottom-nav, con su propio "+ Nuevo") le ganó prioridad en este FAB.
// Apartados existentes se siguen viendo/editando/abonando desde
// /app/apartados, solo ya no se dan de alta desde este acceso rápido.
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
      <VentaCart open={active === "venta"} data={data} onClose={onClose} update={update} />
      <Sheet open={active === "producto"} onOpenChange={(o) => !o && onClose()}>
        <NuevoProductoForm onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "fiado"} onOpenChange={(o) => !o && onClose()}>
        <NuevoFiadoForm onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "gasto"} onOpenChange={(o) => !o && onClose()}>
        <NuevoGastoForm onClose={onClose} update={update} timezone={session.business.timezone} />
      </Sheet>
    </>
  );
}

function NuevoProductoForm({ onClose, update }: { onClose: () => void; update: Props["update"] }) {
  const [nombre, setNombre] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [categoria, setCategoria] = React.useState("");
  const [emoji, setEmoji] = React.useState("");
  const [costo, setCosto] = React.useState("");
  const [precio, setPrecio] = React.useState("");
  const [unidad, setUnidad] = React.useState<GroceryProduct["unidad"]>("pieza");
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
        codigo: codigo.trim() || Math.floor(1000000000 + Math.random() * 8999999999).toString(),
        categoria: categoria.trim() || "General",
        emoji: emoji.trim() || undefined,
        costo: Number(costo),
        precio: Number(precio),
        unidad,
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
          <Label>Código de barras / SKU</Label>
          <div className="flex gap-2">
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Escanéalo o escríbelo" className="flex-1" />
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
          <Label>Stock inicial {unidad !== "pieza" && `(${unidad})`}</Label>
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
          Guardar producto
        </Button>
      </SheetFooter>
      {scanning && (
        <BarcodeScanner
          onScan={(code) => {
            setCodigo(code);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      )}
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
            ...camposEmpleado(),
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

function NuevoGastoForm({ onClose, update, timezone }: { onClose: () => void; update: Props["update"]; timezone?: string }) {
  const [categoria, setCategoria] = React.useState(GASTO_CHIPS[0]);
  const [monto, setMonto] = React.useState("");
  // El día del NEGOCIO, no el del dispositivo (todayISO(0) usaba el reloj
  // del celular) — mismo criterio que el resto de la app.
  const hoy = useHoy(timezone);
  const [fechaPago, setFechaPago] = React.useState(hoy);
  // Apagado por default. Antes arrancaba en `true`: cada gasto del botón
  // rápido quedaba con recordatorio activo sin que nadie lo pidiera, y el
  // dueño terminaba con avisos de todo. El recordatorio es para el gasto
  // que se AGENDA a futuro (la renta del día 1), no para el que se acaba
  // de pagar — que es el 95% de lo que entra por aquí.
  const [recordatorio, setRecordatorio] = React.useState(false);

  // Si el negocio cambia de día con la hoja abierta (o el estado inicial se
  // resolvió antes de saber la zona), la fecha sugerida se pone al día.
  React.useEffect(() => {
    setFechaPago((prev) => (prev === "" ? hoy : prev));
  }, [hoy]);

  const esProgramado = fechaPago > hoy;

  const puedeGuardar = Number(monto) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      const gasto: Expense = {
        id: uid("exp"),
        categoria,
        monto: Number(monto),
        fecha: fechaPago,
        recordatorio: esProgramado && recordatorio,
        // Instante real de captura: es lo que deja que el corte del turno
        // empiece en cero sin arrastrar los gastos del turno anterior (ver
        // gastoEnTurnoActual en lib/turno.ts).
        creadoEn: new Date().toISOString(),
        ...camposEmpleado(),
      };
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
          <p className="text-xs text-muted-foreground">
            {esProgramado
              ? "Como es a futuro, queda PROGRAMADO: no baja tu ganancia todavía. El día que lo pagues lo confirmas en Gastos y ahí se registra."
              : "Se registra como pagado hoy."}
          </p>
        </div>
        {esProgramado && (
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Recordarme</p>
              <p className="text-xs text-muted-foreground">Te lo aviso cuando llegue la fecha.</p>
            </div>
            <Switch checked={recordatorio} onCheckedChange={setRecordatorio} />
          </div>
        )}
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar gasto
        </Button>
      </SheetFooter>
    </>
  );
}
