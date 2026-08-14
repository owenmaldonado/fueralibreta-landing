"use client";

import * as React from "react";
import { CalendarPlus, UserPlus, UserCheck, Wallet, Receipt, PackageMinus, X } from "lucide-react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { FabAction } from "@/components/app-shell/fab";
import { uid, todayISO } from "@/lib/mock";
import { cn } from "@/lib/utils";
import type { TenantData, CajaEntry, BarberClient, InventoryProduct } from "@/lib/types";

export const BARBERIA_ACTIONS: FabAction[] = [
  { key: "cita", label: "Nueva Cita", icon: <CalendarPlus className="h-4 w-4" /> },
  { key: "cliente", label: "Nuevo Cliente", icon: <UserPlus className="h-4 w-4" /> },
  { key: "venta", label: "Venta", icon: <Wallet className="h-4 w-4" /> },
  { key: "gasto", label: "Gasto", icon: <Receipt className="h-4 w-4" /> },
  { key: "consumo", label: "Consumir / Eliminar del inventario", icon: <PackageMinus className="h-4 w-4" /> },
];

interface Props {
  active: string | null;
  onClose: () => void;
  session: TenantData;
  update: (fn: (prev: TenantData) => TenantData) => void;
}

export function BarberiaQuickAdd({ active, onClose, session, update }: Props) {
  const data = session.barberia;
  if (!data) return null;

  return (
    <>
      <Sheet open={active === "cita"} onOpenChange={(o) => !o && onClose()}>
        <NuevaCitaForm data={data} onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "cliente"} onOpenChange={(o) => !o && onClose()}>
        <NuevoClienteForm onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "venta"} onOpenChange={(o) => !o && onClose()}>
        <CajaForm tipo="venta" title="Nueva venta" onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "gasto"} onOpenChange={(o) => !o && onClose()}>
        <CajaForm tipo="gasto" title="Nuevo gasto" onClose={onClose} update={update} />
      </Sheet>
      <Sheet open={active === "consumo"} onOpenChange={(o) => !o && onClose()}>
        <ConsumoForm data={data} onClose={onClose} update={update} />
      </Sheet>
    </>
  );
}

type ClienteResuelto = BarberClient | { nombre: string; telefono: string };

/**
 * Un solo input para "cliente": si lo que se escribe es mayormente números lo
 * trata como teléfono y sugiere nombres que coincidan (y viceversa si es
 * mayormente letras) — busca en la tabla clientes existente. Si no encuentra
 * nada, pide el dato que falte para registrar un cliente nuevo. Reporta hacia
 * arriba el resultado resuelto (o null si todavía no hay nada usable).
 */
function ClienteBuscador({
  clientes,
  onChange,
  autoFocus,
}: {
  clientes: BarberClient[];
  onChange: (r: ClienteResuelto | null) => void;
  autoFocus?: boolean;
}) {
  const [seleccionado, setSeleccionado] = React.useState<BarberClient | null>(null);
  const [busqueda, setBusqueda] = React.useState("");
  const [nombreNuevo, setNombreNuevo] = React.useState("");
  const [telefonoNuevo, setTelefonoNuevo] = React.useState("");

  const q = busqueda.trim();
  const digitos = q.replace(/\D/g, "").length;
  const letras = q.replace(/[^a-zA-Zá-éí-óúÁ-ÉÍ-ÓÚñÑ]/g, "").length;
  const modoTelefono = digitos >= letras;

  const sugerencias = !seleccionado && q.length >= 2 ? clientes.filter((c) => (modoTelefono ? c.telefono.includes(q) : c.nombre.toLowerCase().includes(q.toLowerCase()))).slice(0, 5) : [];
  const esNuevo = !seleccionado && q.length >= 2 && sugerencias.length === 0;

  React.useEffect(() => {
    if (seleccionado) onChange(seleccionado);
    else if (esNuevo && modoTelefono) onChange({ nombre: nombreNuevo.trim(), telefono: q });
    else if (esNuevo && !modoTelefono) onChange({ nombre: q, telefono: telefonoNuevo.trim() });
    else onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado, esNuevo, modoTelefono, q, nombreNuevo, telefonoNuevo]);

  function elegir(c: BarberClient) {
    setBusqueda("");
    setSeleccionado(c);
  }

  function limpiar() {
    setSeleccionado(null);
    setBusqueda("");
    setNombreNuevo("");
    setTelefonoNuevo("");
  }

  if (seleccionado) {
    return (
      <div className="space-y-1.5">
        <Label>Cliente</Label>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-ledger/40 bg-ledger/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm text-ledger">
            <UserCheck className="h-3.5 w-3.5 shrink-0" /> {seleccionado.nombre} · {seleccionado.telefono}
          </p>
          <button type="button" onClick={limpiar} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>Cliente</Label>
      <Input autoFocus={autoFocus} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o teléfono" />
      {sugerencias.length > 0 && (
        <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
          {sugerencias.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => elegir(c)}
              className="flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
            >
              <span className="font-medium">{c.nombre}</span>
              <span className="font-mono text-xs text-muted-foreground">{c.telefono}</span>
            </button>
          ))}
        </div>
      )}
      {esNuevo && modoTelefono && (
        <Input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Nombre del cliente nuevo" />
      )}
      {esNuevo && !modoTelefono && (
        <Input type="tel" value={telefonoNuevo} onChange={(e) => setTelefonoNuevo(e.target.value)} placeholder="Teléfono del cliente nuevo" />
      )}
    </div>
  );
}

function NuevaCitaForm({
  data,
  onClose,
  update,
}: {
  data: NonNullable<TenantData["barberia"]>;
  onClose: () => void;
  update: Props["update"];
}) {
  const [cliente, setCliente] = React.useState<ClienteResuelto | null>(null);
  const [servicioId, setServicioId] = React.useState(data.servicios[0]?.id ?? "");
  const [fecha, setFecha] = React.useState(todayISO(0));
  const [hora, setHora] = React.useState("12:00");

  const servicio = data.servicios.find((s) => s.id === servicioId);
  const puedeGuardar = !!servicio && !!fecha && !!hora && !!cliente && cliente.nombre.trim().length > 1 && cliente.telefono.trim().length >= 6;

  function guardar() {
    if (!puedeGuardar || !servicio || !cliente) return;
    update((prev) => {
      const b = prev.barberia!;
      let clientes = b.clientes;
      let clienteFinalId: string;

      if ("id" in cliente) {
        clienteFinalId = cliente.id;
      } else {
        const nuevo = {
          id: uid("cli"),
          nombre: cliente.nombre.trim(),
          telefono: cliente.telefono.trim(),
          ultimaVisita: null,
          visitas: 0,
        };
        clientes = [nuevo, ...clientes];
        clienteFinalId = nuevo.id;
      }

      const cita = {
        id: uid("cita"),
        clienteId: clienteFinalId,
        clienteNombre: cliente.nombre.trim(),
        clienteTelefono: cliente.telefono.trim(),
        servicioId: servicio.id,
        servicioNombre: servicio.nombre,
        precio: servicio.precio,
        fecha,
        hora,
        estado: "pendiente" as const,
      };

      return { ...prev, barberia: { ...b, clientes, citas: [cita, ...b.citas] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nueva cita" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <ClienteBuscador clientes={data.clientes} onChange={setCliente} autoFocus />
        <div className="space-y-1.5">
          <Label>Servicio</Label>
          <Select value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
            {data.servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} · ${s.precio}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hora</Label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Agendar cita
        </Button>
      </SheetFooter>
    </>
  );
}

function NuevoClienteForm({ onClose, update }: { onClose: () => void; update: Props["update"] }) {
  const [nombre, setNombre] = React.useState("");
  const [telefono, setTelefono] = React.useState("");

  function guardar() {
    if (nombre.trim().length < 2) return;
    update((prev) => {
      const b = prev.barberia!;
      const cliente = {
        id: uid("cli"),
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        ultimaVisita: null,
        visitas: 0,
      };
      return { ...prev, barberia: { ...b, clientes: [cliente, ...b.clientes] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Nuevo cliente" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="331 000 0000" />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={nombre.trim().length < 2} onClick={guardar}>
          Guardar cliente
        </Button>
      </SheetFooter>
    </>
  );
}

function CajaForm({
  tipo,
  title,
  onClose,
  update,
}: {
  tipo: CajaEntry["tipo"];
  title: string;
  onClose: () => void;
  update: Props["update"];
}) {
  const [monto, setMonto] = React.useState("");
  const [concepto, setConcepto] = React.useState(tipo === "venta" ? "Corte" : "Gasto");
  const [metodo, setMetodo] = React.useState<CajaEntry["metodo"]>("efectivo");

  const montoNum = Number(monto);
  const puedeGuardar = montoNum > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const b = prev.barberia!;
      const entry: CajaEntry = {
        id: uid("caja"),
        tipo,
        concepto: concepto.trim() || (tipo === "venta" ? "Venta" : "Gasto"),
        monto: montoNum,
        metodo,
        fecha: new Date().toISOString(),
      };
      return { ...prev, barberia: { ...b, caja: [entry, ...b.caja] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title={title} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Monto</Label>
          <Input
            autoFocus
            type="number"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="$0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Concepto</Label>
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Método</Label>
          <ChipGroup>
            <Chip selected={metodo === "efectivo"} onClick={() => setMetodo("efectivo")}>
              Efectivo
            </Chip>
            <Chip selected={metodo === "transferencia"} onClick={() => setMetodo("transferencia")}>
              Transferencia
            </Chip>
          </ChipGroup>
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar
        </Button>
      </SheetFooter>
    </>
  );
}

const MOTIVOS = ["Vendido", "Uso en servicio", "Se acabó / Merma", "Otro"] as const;

/**
 * Descuenta stock de varios productos a la vez (venta, uso en servicio,
 * merma...) en vez de editar uno por uno desde Productos. Motivo es solo
 * para que quien lo usa recuerde por qué — no hay tabla de movimientos de
 * inventario todavía, así que no se guarda en ningún lado, solo ayuda a
 * decidir la cantidad. Un producto que llega a 0 y tiene el toggle
 * encendido se elimina en vez de quedar en stock 0 — todo en un solo
 * update(), que ya sincroniza a Supabase (UPDATE o DELETE según el caso)
 * igual que cualquier otro cambio de productos en esta app.
 */
function ConsumoForm({
  data,
  onClose,
  update,
}: {
  data: NonNullable<TenantData["barberia"]>;
  onClose: () => void;
  update: Props["update"];
}) {
  const [seleccionados, setSeleccionados] = React.useState<Set<string>>(new Set());
  const [motivo, setMotivo] = React.useState<(typeof MOTIVOS)[number]>("Vendido");
  const [cantidad, setCantidad] = React.useState(1);
  const [eliminarSiLlegaCero, setEliminarSiLlegaCero] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState(false);

  function toggleSeleccion(id: string, checked: boolean) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function stockResultante(p: InventoryProduct): number {
    return Math.max(0, p.stock - cantidad);
  }

  const puedeDescontar = seleccionados.size > 0;

  function descontar() {
    if (!puedeDescontar) return;
    update((prev) => {
      const b = prev.barberia!;
      const productos = b.productos.reduce<InventoryProduct[]>((acc, p) => {
        if (!seleccionados.has(p.id)) {
          acc.push(p);
          return acc;
        }
        const nuevoStock = stockResultante(p);
        if (nuevoStock === 0 && eliminarSiLlegaCero) return acc; // se omite = se elimina
        acc.push({ ...p, stock: nuevoStock });
        return acc;
      }, []);
      return { ...prev, barberia: { ...b, productos } };
    });
    setConfirmando(false);
    onClose();
  }

  return (
    <>
      <SheetHeader title="Consumir / Eliminar del inventario" description="Descuenta stock de varios productos a la vez" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Motivo</Label>
          <ChipGroup>
            {MOTIVOS.map((m) => (
              <Chip key={m} selected={motivo === m} onClick={() => setMotivo(m)}>
                {m}
              </Chip>
            ))}
          </ChipGroup>
        </div>

        <div className="space-y-1.5">
          <Label>Cantidad a descontar (por producto)</Label>
          <Stepper value={cantidad} onChange={setCantidad} min={1} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Eliminar si llega a 0</p>
            <p className="text-xs text-muted-foreground">En vez de dejarlo en stock 0</p>
          </div>
          <Switch checked={eliminarSiLlegaCero} onCheckedChange={setEliminarSiLlegaCero} />
        </div>

        <div className="space-y-1.5">
          <Label>Productos · {seleccionados.size} seleccionado{seleccionados.size === 1 ? "" : "s"}</Label>
          <div className="flex flex-col gap-1.5">
            {data.productos.map((p) => {
              const marcado = seleccionados.has(p.id);
              const nuevoStock = stockResultante(p);
              const seEliminara = marcado && nuevoStock === 0 && eliminarSiLlegaCero;
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                    marcado ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <Checkbox checked={marcado} onCheckedChange={(v) => toggleSeleccion(p.id, v)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      Stock actual: {p.stock}
                      {marcado && (
                        <>
                          {" → "}
                          <span className={seEliminara ? "font-medium text-destructive" : "font-medium text-foreground"}>
                            {seEliminara ? "se elimina" : nuevoStock}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeDescontar} onClick={() => setConfirmando(true)}>
          Descontar {seleccionados.size} producto{seleccionados.size === 1 ? "" : "s"}
        </Button>
      </SheetFooter>

      <ConfirmDialog
        open={confirmando}
        title="Descontar productos"
        description={`¿Seguro? Se descontará ${cantidad} de ${seleccionados.size} producto${seleccionados.size === 1 ? "" : "s"} (${motivo.toLowerCase()})${eliminarSiLlegaCero ? " — los que lleguen a 0 se eliminan del inventario" : ""}.`}
        confirmLabel="Descontar"
        tone="ledger"
        onClose={() => setConfirmando(false)}
        onConfirm={descontar}
      />
    </>
  );
}
