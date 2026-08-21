"use client";

import * as React from "react";
import { MessageCircle, Trash2, HandCoins, CircleCheck } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AbonoDialog } from "@/components/dashboards/abono-dialog";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmptyState } from "@/components/dashboards/empty-state";
import { BloqueoPlan } from "@/components/dashboards/bloqueo-plan";
import { EmpleadoBadge } from "@/components/dashboards/empleado-badge";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { formatMoney, todayISO, waLink } from "@/lib/mock";
import type { Fiado } from "@/lib/types";

export default function FiadosPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [seleccionado, setSeleccionado] = React.useState<Fiado | null>(null);
  const [abonando, setAbonando] = React.useState<Fiado | null>(null);
  const [liquidando, setLiquidando] = React.useState<Fiado | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.abarrotes!;
  const fiados = [...data.fiados].filter((f) => f.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  const totalFiado = fiados.reduce((acc, f) => acc + f.saldo, 0);

  function registrarAbono(monto: number) {
    if (!abonando) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return {
        ...prev,
        abarrotes: {
          ...a,
          fiados: a.fiados.map((f) =>
            f.id === abonando.id
              ? { ...f, saldo: Math.max(0, f.saldo - monto), historial: [{ fecha: todayISO(0), monto, tipo: "abono" as const }, ...f.historial] }
              : f
          ),
        },
      };
    });
    setAbonando(null);
  }

  function confirmarLiquidar() {
    if (!liquidando) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return {
        ...prev,
        abarrotes: {
          ...a,
          fiados: a.fiados.map((f) =>
            f.id === liquidando.id
              ? { ...f, saldo: 0, historial: [{ fecha: todayISO(0), monto: liquidando.saldo, tipo: "abono" as const }, ...f.historial] }
              : f
          ),
        },
      };
    });
    setLiquidando(null);
  }

  return (
    <>
      <PageHeader title="Fiados" subtitle="Lo que te deben" />
      <div className="px-4">
        <StatTile label="Total fiado" value={formatMoney(totalFiado)} />
      </div>
      <div className="flex flex-col gap-2 px-4 py-6">
        {fiados.length === 0 ? (
          <EmptyState texto="Nadie te debe nada 🎉" />
        ) : (
          fiados.map((f) => (
            <div key={f.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
              <button type="button" onClick={() => setSeleccionado(f)} className="flex items-center gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.clienteNombre}</p>
                  <p className="text-xs text-muted-foreground">{f.telefono}</p>
                  <div className="mt-1">
                    <EmpleadoBadge nombre={f.empleadoNombreCache} rol={f.empleadoRolCache} />
                  </div>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold text-primary">{formatMoney(f.saldo)}</span>
              </button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setAbonando(f)}>
                  <HandCoins className="h-3.5 w-3.5" /> Abonar
                </Button>
                <Button size="sm" variant="ledger" className="flex-1" onClick={() => setLiquidando(f)}>
                  <CircleCheck className="h-3.5 w-3.5" /> Liquidar
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Sheet open={!!seleccionado} onOpenChange={(o) => !o && setSeleccionado(null)}>
        {seleccionado && <FiadoDetalle fiado={seleccionado} onClose={() => setSeleccionado(null)} update={update} recordatorioDisponible={plan.giroAbarrotes.recordatorio} />}
      </Sheet>

      <AbonoDialog
        open={!!abonando}
        title={abonando ? `Abono de ${abonando.clienteNombre}` : ""}
        restante={abonando?.saldo ?? 0}
        onClose={() => setAbonando(null)}
        onConfirm={registrarAbono}
      />

      <ConfirmDialog
        open={!!liquidando}
        title="Liquidar saldo"
        description={liquidando ? `Se registrará un abono de ${formatMoney(liquidando.saldo)} y quedará saldado.` : ""}
        confirmLabel="Liquidar"
        tone="ledger"
        onClose={() => setLiquidando(null)}
        onConfirm={confirmarLiquidar}
      />
    </>
  );
}

function FiadoDetalle({
  fiado,
  onClose,
  update,
  recordatorioDisponible,
}: {
  fiado: Fiado;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
  recordatorioDisponible: boolean;
}) {
  const [clienteNombre, setClienteNombre] = React.useState(fiado.clienteNombre);
  const [telefono, setTelefono] = React.useState(fiado.telefono);
  const [abono, setAbono] = React.useState("");
  const [confirmando, setConfirmando] = React.useState(false);

  function guardarCampo(cambios: Partial<Fiado>) {
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, fiados: a.fiados.map((f) => (f.id === fiado.id ? { ...f, ...cambios } : f)) } };
    });
  }

  function registrarAbono() {
    const monto = Number(abono);
    if (!(monto > 0)) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return {
        ...prev,
        abarrotes: {
          ...a,
          fiados: a.fiados.map((f) =>
            f.id === fiado.id
              ? {
                  ...f,
                  saldo: Math.max(0, f.saldo - monto),
                  historial: [{ fecha: todayISO(0), monto, tipo: "abono" as const }, ...f.historial],
                }
              : f
          ),
        },
      };
    });
    onClose();
  }

  function eliminar() {
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, fiados: a.fiados.filter((f) => f.id !== fiado.id) } };
    });
    setConfirmando(false);
    onClose();
  }

  return (
    <>
      <SheetHeader title="Editar fiado" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Input
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
              onBlur={() => clienteNombre.trim() && guardarCampo({ clienteNombre: clienteNombre.trim() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              onBlur={() => guardarCampo({ telefono: telefono.trim() })}
            />
          </div>
        </div>

        <p className="text-center font-display text-2xl font-bold text-primary">Debe {formatMoney(fiado.saldo)}</p>

        {fiado.telefono && (
          <BloqueoPlan activo={recordatorioDisponible} compacto texto="Enviar recordatorio por WhatsApp disponible en Pro y Pro+">
            <Button asChild variant="ledger">
              <a href={waLink(fiado.telefono, `Hola ${fiado.clienteNombre}, te recuerdo tu saldo de $${fiado.saldo}`)} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> Enviar recordatorio
              </a>
            </Button>
          </BloqueoPlan>
        )}

        <div className="space-y-1.5">
          <Label>Registrar abono</Label>
          <Input type="number" inputMode="decimal" value={abono} onChange={(e) => setAbono(e.target.value)} placeholder="$0" />
        </div>

        <div className="space-y-1.5">
          <Label>Historial</Label>
          <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
            {fiado.historial.map((m, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {m.fecha} · {m.tipo === "cargo" ? "Cargo" : "Abono"}
                </span>
                <span className={m.tipo === "cargo" ? "text-primary" : "text-ledger"}>
                  {m.tipo === "cargo" ? "+" : "-"}
                  {formatMoney(m.monto)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmando(true)}
        >
          <Trash2 className="h-4 w-4" /> Eliminar fiado
        </Button>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!(Number(abono) > 0)} onClick={registrarAbono}>
          Guardar abono
        </Button>
      </SheetFooter>

      <ConfirmDialog
        open={confirmando}
        title="Eliminar fiado"
        description={`Se borrará el registro de fiado de ${fiado.clienteNombre}.`}
        onClose={() => setConfirmando(false)}
        onConfirm={eliminar}
      />
    </>
  );
}
