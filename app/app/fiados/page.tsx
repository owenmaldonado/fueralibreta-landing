"use client";

import * as React from "react";
import { MessageCircle } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { formatMoney, todayISO, waLink } from "@/lib/mock";
import type { Fiado } from "@/lib/types";

export default function FiadosPage() {
  const { session, ready, update } = useSession();
  const [seleccionado, setSeleccionado] = React.useState<Fiado | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.abarrotes!;
  const fiados = [...data.fiados].sort((a, b) => b.saldo - a.saldo);
  const totalFiado = fiados.reduce((acc, f) => acc + f.saldo, 0);

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
            <button
              key={f.id}
              onClick={() => setSeleccionado(f)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.clienteNombre}</p>
                <p className="text-xs text-muted-foreground">{f.telefono}</p>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold text-primary">{formatMoney(f.saldo)}</span>
              {f.telefono && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(waLink(f.telefono, `Hola ${f.clienteNombre}, te recuerdo tu saldo de $${f.saldo}`), "_blank");
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ledger hover:bg-secondary"
                >
                  <MessageCircle className="h-4 w-4" />
                </span>
              )}
            </button>
          ))
        )}
      </div>

      <Sheet open={!!seleccionado} onOpenChange={(o) => !o && setSeleccionado(null)}>
        {seleccionado && <FiadoDetalle fiado={seleccionado} onClose={() => setSeleccionado(null)} update={update} />}
      </Sheet>
    </>
  );
}

function FiadoDetalle({
  fiado,
  onClose,
  update,
}: {
  fiado: Fiado;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [abono, setAbono] = React.useState("");

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

  return (
    <>
      <SheetHeader title={fiado.clienteNombre} description={`Debe ${formatMoney(fiado.saldo)}`} onClose={onClose} />
      <div className="flex flex-col gap-4">
        {fiado.telefono && (
          <Button asChild variant="ledger">
            <a href={waLink(fiado.telefono, `Hola ${fiado.clienteNombre}, te recuerdo tu saldo de $${fiado.saldo}`)} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> Enviar recordatorio
            </a>
          </Button>
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
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!(Number(abono) > 0)} onClick={registrarAbono}>
          Guardar abono
        </Button>
      </SheetFooter>
    </>
  );
}
