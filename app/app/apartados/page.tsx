"use client";

import * as React from "react";
import { MessageCircle } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { formatMoney, waLink } from "@/lib/mock";
import type { Apartado } from "@/lib/types";

export default function ApartadosPage() {
  const { session, ready, update } = useSession();
  const [seleccionado, setSeleccionado] = React.useState<Apartado | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.abarrotes!;
  const apartados = [...data.apartados].sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));

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
              <button
                key={a.id}
                onClick={() => setSeleccionado(a)}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left"
              >
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
            );
          })
        )}
      </div>

      <Sheet open={!!seleccionado} onOpenChange={(o) => !o && setSeleccionado(null)}>
        {seleccionado && <ApartadoDetalle apartado={seleccionado} onClose={() => setSeleccionado(null)} update={update} />}
      </Sheet>
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
  const [abono, setAbono] = React.useState("");
  const restante = apartado.total - apartado.abonado;

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

  return (
    <>
      <SheetHeader title={apartado.clienteNombre} description={apartado.producto} onClose={onClose} />
      <div className="flex flex-col gap-4">
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
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!(Number(abono) > 0)} onClick={registrarAbono}>
          Guardar abono
        </Button>
      </SheetFooter>
    </>
  );
}
