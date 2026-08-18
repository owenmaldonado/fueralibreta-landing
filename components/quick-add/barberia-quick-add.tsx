"use client";

import * as React from "react";
import { CalendarPlus, UserPlus, UserCheck, Wallet, Receipt, PackageMinus, X } from "lucide-react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Stepper } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BloqueoPlan } from "@/components/dashboards/bloqueo-plan";
import type { FabAction } from "@/components/app-shell/fab";
import { usePlan } from "@/lib/planes";
import { uid, todayISO } from "@/lib/mock";
import { cn } from "@/lib/utils";
import { camposEmpleado } from "@/lib/empleados";
import { encolarVentaPendiente } from "@/lib/offline-sales-queue";
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
  update: (fn: (prev: TenantData) => TenantData, opciones?: { ventaOffline?: boolean }) => void;
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
        <NuevoClienteForm onClose={onClose} update={update} clientesActuales={data.clientes.length} />
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
  const plan = usePlan();
  const [cliente, setCliente] = React.useState<ClienteResuelto | null>(null);
  const [servicioId, setServicioId] = React.useState(data.servicios[0]?.id ?? "");
  const [fecha, setFecha] = React.useState(todayISO(0));
  const [hora, setHora] = React.useState("12:00");

  const servicio = data.servicios.find((s) => s.id === servicioId);
  const clienteEsNuevo = !!cliente && !("id" in cliente);
  const maxClientes = plan.giroBarberia.maxClientes;
  const bloqueadoPorLimiteClientes = clienteEsNuevo && maxClientes !== null && data.clientes.length >= maxClientes;
  const mesActual = todayISO(0).slice(0, 7);
  const maxCitas = plan.giroBarberia.maxCitas;
  const bloqueadoPorLimiteCitas =
    maxCitas !== null && data.citas.filter((c) => c.fecha.startsWith(mesActual) && c.estado !== "cancelada").length >= maxCitas;
  const puedeGuardar =
    !!servicio &&
    !!fecha &&
    !!hora &&
    !!cliente &&
    cliente.nombre.trim().length > 1 &&
    cliente.telefono.trim().length >= 6 &&
    !bloqueadoPorLimiteClientes &&
    !bloqueadoPorLimiteCitas;

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
        {bloqueadoPorLimiteClientes && (
          <BloqueoPlan activo={false} compacto texto={`Llegaste al límite de ${maxClientes} clientes de tu plan ${plan.label}`} />
        )}
        {bloqueadoPorLimiteCitas && (
          <BloqueoPlan activo={false} compacto texto={`Llegaste al límite de ${maxCitas} citas este mes de tu plan ${plan.label}`} />
        )}
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Agendar cita
        </Button>
      </SheetFooter>
    </>
  );
}

function NuevoClienteForm({
  onClose,
  update,
  clientesActuales,
}: {
  onClose: () => void;
  update: Props["update"];
  clientesActuales: number;
}) {
  const plan = usePlan();
  const [nombre, setNombre] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const maxClientes = plan.giroBarberia.maxClientes;
  const bloqueadoPorLimite = maxClientes !== null && clientesActuales >= maxClientes;

  function guardar() {
    if (nombre.trim().length < 2 || bloqueadoPorLimite) return;
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
        {bloqueadoPorLimite && (
          <BloqueoPlan activo={false} compacto texto={`Llegaste al límite de ${maxClientes} clientes de tu plan ${plan.label}`} />
        )}
      </div>
      <SheetFooter>
        <Button size="lg" disabled={nombre.trim().length < 2 || bloqueadoPorLimite} onClick={guardar}>
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
    const entryId = uid("caja");
    const esVenta = tipo === "venta";
    let entryCreada: CajaEntry | null = null;
    let negocioId = "";
    update(
      (prev) => {
        const b = prev.barberia!;
        const entry: CajaEntry = {
          id: entryId,
          tipo,
          concepto: concepto.trim() || (tipo === "venta" ? "Venta" : "Gasto"),
          monto: montoNum,
          metodo,
          fecha: new Date().toISOString(),
          ...camposEmpleado(),
        };
        entryCreada = entry;
        negocioId = prev.business.id;
        return { ...prev, barberia: { ...b, caja: [entry, ...b.caja] } };
      },
      // Solo "venta" cuenta como vender — "gasto" queda bloqueado sin
      // conexión igual que cualquier otra pantalla de administración.
      esVenta ? { ventaOffline: true } : undefined
    );
    if (esVenta && typeof navigator !== "undefined" && !navigator.onLine && entryCreada) {
      encolarVentaPendiente({
        id: entryId,
        negocioId,
        tipo: "barberia_caja",
        payload: entryCreada,
        ...camposEmpleado(),
      }).catch((err) => console.error("No se pudo encolar la venta pendiente:", err));
    }
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

const MOTIVOS = ["Vendido", "Uso en servicio", "Merma", "Otro"] as const;

/**
 * Descuenta stock de varios productos a la vez (venta, uso en servicio,
 * merma...) en vez de editar uno por uno desde Productos. Motivo es solo
 * para que quien lo usa recuerde por qué — no hay tabla de movimientos de
 * inventario todavía, así que no se guarda en ningún lado, solo queda como
 * contexto de la confirmación. Un producto que llega a 0 se elimina en vez
 * de quedar en stock 0 SOLO si tiene su propio switch "Auto-eliminar cuando
 * llegue a 0" prendido (ver ProductoForm en app/app/productos/page.tsx) —
 * ya no es un toggle de este modal, es una propiedad del producto. Todo en
 * un solo update(), que ya sincroniza a Supabase (UPDATE o DELETE según el
 * caso) igual que cualquier otro cambio de productos en esta app.
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
  const [cantidades, setCantidades] = React.useState<Record<string, number>>({});
  const [confirmando, setConfirmando] = React.useState(false);

  function toggleSeleccion(id: string, checked: boolean) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    if (checked) setCantidades((prev) => (prev[id] ? prev : { ...prev, [id]: 1 }));
  }

  function cantidadDe(id: string): number {
    return cantidades[id] ?? 1;
  }

  function stockResultante(p: InventoryProduct): number {
    return Math.max(0, p.stock - cantidadDe(p.id));
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
        if (nuevoStock === 0 && p.eliminarEnCero) return acc; // se omite = se elimina
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
              <Chip key={m} selected={motivo === m} onClick={() => setMotivo(m)} className="px-3 py-1.5 text-xs">
                {m}
              </Chip>
            ))}
          </ChipGroup>
        </div>

        <div className="space-y-1.5">
          <Label>Productos · {seleccionados.size} seleccionado{seleccionados.size === 1 ? "" : "s"}</Label>
          <div className="flex flex-col gap-1.5">
            {data.productos.map((p) => {
              const marcado = seleccionados.has(p.id);
              const nuevoStock = stockResultante(p);
              const seEliminara = marcado && nuevoStock === 0 && p.eliminarEnCero;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                    marcado ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <label className="flex min-w-0 flex-1 items-center gap-3">
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
                  {marcado && (
                    <Stepper
                      value={cantidadDe(p.id)}
                      onChange={(v) => setCantidades((prev) => ({ ...prev, [p.id]: v }))}
                      min={1}
                      className="shrink-0"
                    />
                  )}
                </div>
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
        description={`¿Seguro? Se descontará de ${seleccionados.size} producto${seleccionados.size === 1 ? "" : "s"} (${motivo.toLowerCase()}).`}
        confirmLabel="Descontar"
        tone="ledger"
        onClose={() => setConfirmando(false)}
        onConfirm={descontar}
      />
    </>
  );
}
