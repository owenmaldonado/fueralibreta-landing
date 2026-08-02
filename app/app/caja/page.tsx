"use client";

import * as React from "react";
import { Banknote, CreditCard, HandCoins, Receipt, Plus, Pencil, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmptyState } from "@/components/dashboards/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/session";
import { formatMoney, uid } from "@/lib/mock";
import { cn } from "@/lib/utils";
import type { CajaEntry } from "@/lib/types";

const ICONS = { venta: Banknote, propina: HandCoins, gasto: Receipt };

export default function CajaPage() {
  const { session, ready, update } = useSession();
  const [addOpen, setAddOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<CajaEntry | null>(null);
  const [borrando, setBorrando] = React.useState<CajaEntry | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  const ventas = data.caja.filter((e) => e.tipo === "venta").reduce((acc, e) => acc + e.monto, 0);
  const propinas = data.caja.filter((e) => e.tipo === "propina").reduce((acc, e) => acc + e.monto, 0);
  const efectivo = data.caja.filter((e) => e.tipo !== "gasto" && e.metodo === "efectivo").reduce((acc, e) => acc + e.monto, 0);
  const transferencia = data.caja.filter((e) => e.tipo !== "gasto" && e.metodo === "transferencia").reduce((acc, e) => acc + e.monto, 0);

  const movimientos = [...data.caja].sort((a, b) => b.fecha.localeCompare(a.fecha));

  function eliminar() {
    if (!borrando) return;
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, caja: b.caja.filter((m) => m.id !== borrando.id) } };
    });
    setBorrando(null);
  }

  return (
    <>
      <PageHeader
        title="Caja"
        subtitle="Ventas, propinas y gastos"
        action={
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 px-4">
        <StatTile label="Ventas" value={formatMoney(ventas)} />
        <StatTile label="Propinas" value={formatMoney(propinas)} />
        <StatTile label="Efectivo" value={formatMoney(efectivo)} />
        <StatTile label="Transferencia" value={formatMoney(transferencia)} />
      </div>

      <div className="flex flex-col gap-2 px-4 py-6">
        <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Movimientos</p>
        {movimientos.length === 0 ? (
          <EmptyState texto="Sin movimientos todavía" />
        ) : (
          movimientos.map((m) => {
            const Icon = ICONS[m.tipo];
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    m.tipo === "gasto" ? "bg-destructive/10 text-destructive" : "bg-ledger/10 text-ledger"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.concepto}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {new Date(m.fecha).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    <CreditCard className="hidden h-3 w-3" />
                    · {m.metodo === "efectivo" ? "Efectivo" : "Transferencia"}
                  </p>
                </div>
                <span className={cn("shrink-0 font-mono text-sm", m.tipo === "gasto" ? "text-destructive" : "text-foreground")}>
                  {m.tipo === "gasto" ? "-" : "+"}
                  {formatMoney(m.monto)}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => setEditando(m)}
                    aria-label="Editar movimiento"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setBorrando(m)}
                    aria-label="Eliminar movimiento"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <CajaForm onClose={() => setAddOpen(false)} update={update} />
      </Sheet>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <CajaForm entry={editando} onClose={() => setEditando(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar movimiento"
        description={`Se borrará "${borrando?.concepto}" por ${borrando ? formatMoney(borrando.monto) : ""}.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminar}
      />
    </>
  );
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CajaForm({
  entry,
  onClose,
  update,
}: {
  entry?: CajaEntry;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [tipo, setTipo] = React.useState<CajaEntry["tipo"]>(entry?.tipo ?? "venta");
  const [concepto, setConcepto] = React.useState(entry?.concepto ?? "Corte");
  const [monto, setMonto] = React.useState(String(entry?.monto ?? ""));
  const [metodo, setMetodo] = React.useState<CajaEntry["metodo"]>(entry?.metodo ?? "efectivo");
  const [fecha, setFecha] = React.useState(entry ? toDatetimeLocal(entry.fecha) : toDatetimeLocal(new Date().toISOString()));

  const puedeGuardar = Number(monto) > 0 && concepto.trim().length > 0;

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const b = prev.barberia!;
      const datos = { tipo, concepto: concepto.trim(), monto: Number(monto), metodo, fecha };
      if (entry) {
        return { ...prev, barberia: { ...b, caja: b.caja.map((m) => (m.id === entry.id ? { ...m, ...datos } : m)) } };
      }
      const nuevo: CajaEntry = { id: uid("caja"), ...datos };
      return { ...prev, barberia: { ...b, caja: [nuevo, ...b.caja] } };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title={entry ? "Editar movimiento" : "Nuevo movimiento"} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <ChipGroup>
            <Chip selected={tipo === "venta"} onClick={() => setTipo("venta")}>
              Venta
            </Chip>
            <Chip selected={tipo === "propina"} onClick={() => setTipo("propina")}>
              Propina
            </Chip>
            <Chip selected={tipo === "gasto"} onClick={() => setTipo("gasto")} tone="danger">
              Gasto
            </Chip>
          </ChipGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Concepto</Label>
          <Input autoFocus value={concepto} onChange={(e) => setConcepto(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Monto</Label>
          <Input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0" />
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
        <div className="space-y-1.5">
          <Label>Fecha y hora</Label>
          <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          {entry ? "Guardar cambios" : "Guardar"}
        </Button>
      </SheetFooter>
    </>
  );
}
