"use client";

import * as React from "react";
import { MessageCircle, Trash2, HandCoins, PackageCheck } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AbonoDialog } from "@/components/dashboards/abono-dialog";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { formatMoney, waLink } from "@/lib/mock";
import type { Apartado } from "@/lib/types";

export default function ApartadosPage() {
  const { session, ready, update } = useSession();
  const [seleccionado, setSeleccionado] = React.useState<Apartado | null>(null);
  const [abonando, setAbonando] = React.useState<Apartado | null>(null);
  const [entregando, setEntregando] = React.useState<Apartado | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.abarrotes!;
  const apartados = [...data.apartados].filter((a) => !a.entregado).sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));

  function registrarAbono(monto: number) {
    if (!abonando) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return {
        ...prev,
        abarrotes: {
          ...a,
          apartados: a.apartados.map((ap) => (ap.id === abonando.id ? { ...ap, abonado: Math.min(ap.total, ap.abonado + monto) } : ap)),
        },
      };
    });
    setAbonando(null);
  }

  function confirmarEntrega() {
    if (!entregando) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, apartados: a.apartados.map((ap) => (ap.id === entregando.id ? { ...ap, entregado: true } : ap)) } };
    });
    setEntregando(null);
  }

  return (
    <>
      <PageHeader title="Apartados" subtitle="Productos separados con abonos" />
      <div className="flex flex-col gap-2 px-4 pb-6">
        {apartados.length === 0 ? (
          <EmptyState texto="Sin apartados activos" />
        ) : (
          apartados.map((a) => {
            const restante = a.total - a.abonado;
            const pct = Math.min(100, Math.round((a.abonado / a.total) * 100));
            return (
              <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
                <button type="button" onClick={() => setSeleccionado(a)} className="flex flex-col gap-2 text-left">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{a.clienteNombre}</p>
                    <span className="text-xs text-muted-foreground">Vence {a.fechaLimite}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.producto}</p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-ledger transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Abonado {formatMoney(a.abonado)} de {formatMoney(a.total)}
                    </span>
                    <span className="font-medium text-primary">Faltan {formatMoney(restante)}</span>
                  </div>
                </button>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setAbonando(a)}>
                    <HandCoins className="h-3.5 w-3.5" /> Abonar
                  </Button>
                  <Button size="sm" variant="ledger" className="flex-1" onClick={() => setEntregando(a)}>
                    <PackageCheck className="h-3.5 w-3.5" /> Entregar
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Sheet open={!!seleccionado} onOpenChange={(o) => !o && setSeleccionado(null)}>
        {seleccionado && <ApartadoDetalle apartado={seleccionado} onClose={() => setSeleccionado(null)} update={update} />}
      </Sheet>

      <AbonoDialog
        open={!!abonando}
        title={abonando ? `Abono de ${abonando.clienteNombre}` : ""}
        restante={abonando ? abonando.total - abonando.abonado : 0}
        onClose={() => setAbonando(null)}
        onConfirm={registrarAbono}
      />

      <ConfirmDialog
        open={!!entregando}
        title="Marcar como entregado"
        description={
          entregando && entregando.abonado < entregando.total
            ? `Aún debe ${formatMoney(entregando.total - entregando.abonado)}. Se quitará de la lista de apartados activos.`
            : "Se quitará de la lista de apartados activos."
        }
        confirmLabel="Entregar"
        tone="ledger"
        onClose={() => setEntregando(null)}
        onConfirm={confirmarEntrega}
      />
    </>
  );
}

function ApartadoDetalle({
  apartado,
  onClose,
  update,
}: {
  apartado: Apartado;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [clienteNombre, setClienteNombre] = React.useState(apartado.clienteNombre);
  const [telefono, setTelefono] = React.useState(apartado.telefono);
  const [producto, setProducto] = React.useState(apartado.producto);
  const [total, setTotal] = React.useState(String(apartado.total));
  const [fechaLimite, setFechaLimite] = React.useState(apartado.fechaLimite);
  const [abono, setAbono] = React.useState("");
  const [confirmando, setConfirmando] = React.useState(false);

  const restante = apartado.total - apartado.abonado;

  function guardarCampo(cambios: Partial<Apartado>) {
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, apartados: a.apartados.map((ap) => (ap.id === apartado.id ? { ...ap, ...cambios } : ap)) } };
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
          apartados: a.apartados.map((ap) =>
            ap.id === apartado.id ? { ...ap, abonado: Math.min(ap.total, ap.abonado + monto) } : ap
          ),
        },
      };
    });
    onClose();
  }

  function eliminar() {
    update((prev) => {
      const a = prev.abarrotes!;
      return { ...prev, abarrotes: { ...a, apartados: a.apartados.filter((ap) => ap.id !== apartado.id) } };
    });
    setConfirmando(false);
    onClose();
  }

  return (
    <>
      <SheetHeader title="Editar apartado" onClose={onClose} />
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
        <div className="space-y-1.5">
          <Label>Producto</Label>
          <Input
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            onBlur={() => producto.trim() && guardarCampo({ producto: producto.trim() })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Total</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              onBlur={() => Number(total) > 0 && guardarCampo({ total: Number(total) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha límite</Label>
            <Input
              type="date"
              value={fechaLimite}
              onChange={(e) => {
                setFechaLimite(e.target.value);
                guardarCampo({ fechaLimite: e.target.value });
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg border border-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Abonado</p>
            <p className="mt-1 font-display text-lg font-bold">{formatMoney(apartado.abonado)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Restante</p>
            <p className="mt-1 font-display text-lg font-bold text-primary">{formatMoney(restante)}</p>
          </div>
        </div>

        {apartado.telefono && (
          <Button asChild variant="ledger">
            <a
              href={waLink(
                apartado.telefono,
                `Hola ${apartado.clienteNombre}, tu apartado de ${apartado.producto} tiene un restante de $${restante}, vence el ${apartado.fechaLimite}`
              )}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="h-4 w-4" /> Enviar recordatorio
            </a>
          </Button>
        )}

        <div className="space-y-1.5">
          <Label>Registrar abono</Label>
          <Input type="number" inputMode="decimal" value={abono} onChange={(e) => setAbono(e.target.value)} placeholder="$0" />
        </div>

        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmando(true)}
        >
          <Trash2 className="h-4 w-4" /> Eliminar apartado
        </Button>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!(Number(abono) > 0)} onClick={registrarAbono}>
          Guardar abono
        </Button>
      </SheetFooter>

      <ConfirmDialog
        open={confirmando}
        title="Eliminar apartado"
        description={`Se borrará el apartado de ${apartado.clienteNombre}.`}
        onClose={() => setConfirmando(false)}
        onConfirm={eliminar}
      />
    </>
  );
}
