"use client";

import * as React from "react";
import { CalendarPlus, UserPlus, UserCheck, Wallet, Receipt } from "lucide-react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import type { FabAction } from "@/components/app-shell/fab";
import { uid, todayISO } from "@/lib/mock";
import type { TenantData, CajaEntry } from "@/lib/types";

export const BARBERIA_ACTIONS: FabAction[] = [
  { key: "cita", label: "Nueva Cita", icon: <CalendarPlus className="h-4 w-4" /> },
  { key: "cliente", label: "Nuevo Cliente", icon: <UserPlus className="h-4 w-4" /> },
  { key: "venta", label: "Venta", icon: <Wallet className="h-4 w-4" /> },
  { key: "gasto", label: "Gasto", icon: <Receipt className="h-4 w-4" /> },
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
    </>
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
  const [telefono, setTelefono] = React.useState("");
  const [nuevoNombre, setNuevoNombre] = React.useState("");
  const [servicioId, setServicioId] = React.useState(data.servicios[0]?.id ?? "");
  const [fecha, setFecha] = React.useState(todayISO(0));
  const [hora, setHora] = React.useState("12:00");

  const telefonoLimpio = telefono.trim();
  const clienteExistente = telefonoLimpio.length >= 6 ? data.clientes.find((c) => c.telefono.trim() === telefonoLimpio) : undefined;
  const esClienteNuevo = telefonoLimpio.length >= 6 && !clienteExistente;

  const servicio = data.servicios.find((s) => s.id === servicioId);
  const puedeGuardar =
    !!servicio && !!fecha && !!hora && telefonoLimpio.length >= 6 && (clienteExistente || nuevoNombre.trim().length > 1);

  function guardar() {
    if (!puedeGuardar || !servicio) return;
    update((prev) => {
      const b = prev.barberia!;
      let clientes = b.clientes;
      let clienteFinalId: string;
      let clienteNombre: string;

      if (clienteExistente) {
        clienteFinalId = clienteExistente.id;
        clienteNombre = clienteExistente.nombre;
      } else {
        const nuevo = {
          id: uid("cli"),
          nombre: nuevoNombre.trim(),
          telefono: telefonoLimpio,
          ultimaVisita: null,
          visitas: 0,
        };
        clientes = [nuevo, ...clientes];
        clienteFinalId = nuevo.id;
        clienteNombre = nuevo.nombre;
      }

      const cita = {
        id: uid("cita"),
        clienteId: clienteFinalId,
        clienteNombre,
        clienteTelefono: telefonoLimpio,
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
        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input autoFocus type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="331 000 0000" />
          {clienteExistente ? (
            <p className="flex items-center gap-1.5 text-xs text-ledger">
              <UserCheck className="h-3.5 w-3.5" /> {clienteExistente.nombre}
            </p>
          ) : esClienteNuevo ? (
            <p className="text-xs text-muted-foreground">Cliente nuevo, escribe su nombre abajo</p>
          ) : null}
        </div>
        {esClienteNuevo && (
          <div className="space-y-1.5">
            <Label>Nombre del cliente</Label>
            <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre" />
          </div>
        )}
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
