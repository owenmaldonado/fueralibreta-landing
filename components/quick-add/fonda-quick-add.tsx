"use client";

import * as React from "react";
import { ClipboardList, UtensilsCrossed, Receipt, X } from "lucide-react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Stepper } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import type { FabAction } from "@/components/app-shell/fab";
import { uid, formatMoney, todayISO } from "@/lib/mock";
import { camposEmpleado } from "@/lib/empleados";
import { encolarVentaPendiente } from "@/lib/offline-sales-queue";
import type { TenantData, OrderItem, Expense, FondaOrder } from "@/lib/types";

export const FONDA_ACTIONS: FabAction[] = [
  { key: "pedido", label: "Nuevo Pedido", icon: <ClipboardList className="h-4 w-4" /> },
  { key: "platillo", label: "Platillo", icon: <UtensilsCrossed className="h-4 w-4" /> },
  { key: "gasto", label: "Gasto", icon: <Receipt className="h-4 w-4" /> },
];

interface Props {
  active: string | null;
  onClose: () => void;
  session: TenantData;
  update: (fn: (prev: TenantData) => TenantData, opciones?: { ventaOffline?: boolean }) => void;
}

const NOTA_CHIPS = ["Sin cebolla", "Sin chile", "Para llevar", "Extra salsa"];
const CATEGORIA_CHIPS = ["Platillo fuerte", "Entrada", "Bebida", "Postre"];
const GASTO_CHIPS = ["Gas", "Carne", "Verdura", "Renta", "Otro"];

export function FondaQuickAdd({ active, onClose, session, update }: Props) {
  const data = session.fonda;
  if (!data) return null;

  return (
    <>
      <Sheet open={active === "pedido"} onOpenChange={(o) => !o && onClose()}>
        <NuevoPedidoForm data={data} onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "platillo"} onOpenChange={(o) => !o && onClose()}>
        <NuevoPlatilloForm onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "gasto"} onOpenChange={(o) => !o && onClose()}>
        <NuevoGastoForm onClose={onClose} update={update} />
      </Sheet>
    </>
  );
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function NuevoPedidoForm({
  data,
  onClose,
  update,
}: {
  data: NonNullable<TenantData["fonda"]>;
  onClose: () => void;
  update: Props["update"];
}) {
  const [clienteNombre, setClienteNombre] = React.useState("");
  const [hora] = React.useState(nowHHMM());
  const [modo, setModo] = React.useState<"cobrar" | "programar">("cobrar");
  const [horaEntregaInput, setHoraEntregaInput] = React.useState("");
  const [items, setItems] = React.useState<OrderItem[]>([]);
  const [configurando, setConfigurando] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState(1);
  const [notas, setNotas] = React.useState<Set<string>>(new Set());
  const [comentario, setComentario] = React.useState("");

  const disponibles = data.platillos.filter((p) => p.activoHoy);
  const total = items.reduce((acc, it) => {
    const dish = data.platillos.find((p) => p.id === it.platilloId);
    return acc + (dish?.precio ?? 0) * it.cantidad;
  }, 0);

  function abrirConfig(platilloId: string) {
    setConfigurando(platilloId);
    setQty(1);
    setNotas(new Set());
    setComentario("");
  }

  function toggleNota(n: string) {
    setNotas((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  }

  function agregarItem() {
    if (!configurando) return;
    const dish = data.platillos.find((p) => p.id === configurando);
    if (!dish) return;
    const notaTexto = [...notas, comentario.trim()].filter(Boolean).join(", ");
    setItems((prev) => [
      ...prev,
      {
        id: uid("it"),
        platilloId: dish.id,
        platilloNombre: dish.nombre,
        cantidad: qty,
        nota: notaTexto || undefined,
        precioUnitario: dish.precio,
        costoUnitario: dish.costo,
      },
    ]);
    setConfigurando(null);
  }

  function quitarItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  const horaEntrega = modo === "programar" && horaEntregaInput ? horaEntregaInput : undefined;

  function guardar() {
    if (!clienteNombre.trim() || items.length === 0) return;
    const pedidoId = uid("ped");
    let pedidoCreado: FondaOrder | null = null;
    let negocioId = "";
    update(
      (prev) => {
        const f = prev.fonda!;
        const pedido: FondaOrder = {
          id: pedidoId,
          clienteNombre: clienteNombre.trim(),
          fecha: todayISO(0),
          hora,
          horaEntrega,
          items,
          // "Cobrar ahora": venta directa, ya entregada, mismo flujo que
          // abarrotera — no pasa por Pedidos pendientes. "Programar": sí va a
          // pendientes, con la hora de entrega prometida si se puso.
          estado: modo === "cobrar" ? ("entregado" as const) : ("pendiente" as const),
          total,
          ...camposEmpleado(),
        };
        pedidoCreado = pedido;
        negocioId = prev.business.id;
        return { ...prev, fonda: { ...f, pedidos: [pedido, ...f.pedidos] } };
      },
      { ventaOffline: true }
    );
    if (typeof navigator !== "undefined" && !navigator.onLine && pedidoCreado) {
      encolarVentaPendiente({
        id: pedidoId,
        negocioId,
        tipo: "fonda_pedido",
        payload: pedidoCreado,
        ...camposEmpleado(),
      }).catch((err) => console.error("No se pudo encolar la venta pendiente:", err));
    }
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nuevo pedido" description={`Hora: ${hora}`} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Input autoFocus value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" />
        </div>

        <div className="space-y-1.5">
          <ChipGroup>
            <Chip selected={modo === "cobrar"} onClick={() => setModo("cobrar")}>
              Cobrar ahora · Entregar
            </Chip>
            <Chip
              selected={modo === "programar"}
              onClick={() => setModo("programar")}
            >
              Programar
            </Chip>
          </ChipGroup>
          {modo === "programar" && (
            <div className="mt-1.5 space-y-1.5">
              <Label>Entrega programada</Label>
              {/* type="time" nativo: siempre entrega HH:mm en 24h sin
                  ambigüedad AM/PM, y en celular abre el selector de reloj. */}
              <Input
                type="time"
                min="00:00"
                max="23:59"
                value={horaEntregaInput}
                onChange={(e) => setHoraEntregaInput(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Agregar platillo</Label>
          <ChipGroup>
            {disponibles.map((p) => (
              <Chip key={p.id} selected={configurando === p.id} onClick={() => abrirConfig(p.id)}>
                {p.nombre} · ${p.precio}
              </Chip>
            ))}
          </ChipGroup>
        </div>

        {configurando && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{data.platillos.find((p) => p.id === configurando)?.nombre}</p>
              <Stepper value={qty} onChange={setQty} min={1} />
            </div>
            <div className="mt-3 space-y-1.5">
              <Label>Nota rápida</Label>
              <ChipGroup>
                {NOTA_CHIPS.map((n) => (
                  <Chip key={n} selected={notas.has(n)} onClick={() => toggleNota(n)} tone="danger">
                    {n}
                  </Chip>
                ))}
              </ChipGroup>
            </div>
            <Input
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comentario opcional"
              className="mt-3"
            />
            <Button className="mt-3 w-full" size="sm" onClick={agregarItem}>
              Agregar al pedido
            </Button>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-1.5">
            <Label>Pedido</Label>
            <div className="flex flex-col gap-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                  <div>
                    <p>
                      {it.cantidad}× {it.platilloNombre}
                    </p>
                    {it.nota && <p className="text-xs font-medium text-destructive">{it.nota}</p>}
                  </div>
                  <button onClick={() => quitarItem(it.id)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="pt-1 text-right font-mono text-sm text-muted-foreground">Total: {formatMoney(total)}</p>
          </div>
        )}
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!clienteNombre.trim() || items.length === 0} onClick={guardar}>
          {modo === "cobrar" ? "Cobrar" : "Programar pedido"}
        </Button>
      </SheetFooter>
    </>
  );
}

function NuevoPlatilloForm({ onClose, update }: { onClose: () => void; update: Props["update"] }) {
  const [nombre, setNombre] = React.useState("");
  const [precio, setPrecio] = React.useState("");
  const [categoria, setCategoria] = React.useState(CATEGORIA_CHIPS[0]);

  const puedeGuardar = nombre.trim().length > 1 && Number(precio) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const f = prev.fonda!;
      const platillo = { id: uid("dish"), nombre: nombre.trim(), precio: Number(precio), categoria, activoHoy: true };
      return { ...prev, fonda: { ...f, platillos: [platillo, ...f.platillos] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nuevo platillo" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Chiles rellenos" />
        </div>
        <div className="space-y-1.5">
          <Label>Precio</Label>
          <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$0" />
        </div>
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <ChipGroup>
            {CATEGORIA_CHIPS.map((c) => (
              <Chip key={c} selected={categoria === c} onClick={() => setCategoria(c)}>
                {c}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar platillo
        </Button>
      </SheetFooter>
    </>
  );
}

function NuevoGastoForm({ onClose, update }: { onClose: () => void; update: Props["update"] }) {
  const [categoria, setCategoria] = React.useState(GASTO_CHIPS[0]);
  const [monto, setMonto] = React.useState("");

  const puedeGuardar = Number(monto) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const f = prev.fonda!;
      const gasto: Expense = { id: uid("exp"), categoria, monto: Number(monto), fecha: todayISO(0) };
      return { ...prev, fonda: { ...f, gastos: [gasto, ...f.gastos] } };
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
          <Input autoFocus type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0" />
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
