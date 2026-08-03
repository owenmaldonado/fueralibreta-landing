"use client";

import * as React from "react";
import { Search, MessageCircle, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { daysSince, formatMoney, statsVisitasCliente, waLink } from "@/lib/mock";
import type { BarberClient } from "@/lib/types";

export default function ClientesPage() {
  const { session, ready, update } = useSession();
  const [q, setQ] = React.useState("");
  const [seleccionado, setSeleccionado] = React.useState<BarberClient | null>(null);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  const filtrados = data.clientes
    .filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase()) || c.telefono.includes(q))
    .map((c) => ({ ...c, ...statsVisitasCliente(data.citas, c.id) }))
    .sort((a, b) => {
      const da = daysSince(a.ultimaVisita) ?? -1;
      const db = daysSince(b.ultimaVisita) ?? -1;
      return db - da;
    });

  return (
    <>
      <PageHeader title="Clientes" subtitle={`${data.clientes.length} en total`} />
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente..." className="pl-9" />
        </div>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-6">
        {filtrados.length === 0 ? (
          <EmptyState texto="Sin clientes todavía" />
        ) : (
          filtrados.map((c) => {
            const dias = daysSince(c.ultimaVisita);
            const alerta = dias !== null && dias >= 30;
            return (
              <button
                key={c.id}
                onClick={() => setSeleccionado(c)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-semibold text-primary">
                  {c.nombre.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.nombre}</p>
                  <p className={`text-xs ${alerta ? "font-medium text-primary" : "text-muted-foreground"}`}>
                    {dias === null ? "Nunca ha venido" : `Hace ${dias} días · ${c.visitas} visitas`}
                  </p>
                </div>
                {c.telefono && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(waLink(c.telefono, `Hola ${c.nombre}, ¿cómo estás?`), "_blank");
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ledger hover:bg-secondary"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <Sheet open={!!seleccionado} onOpenChange={(o) => !o && setSeleccionado(null)}>
        {seleccionado && (
          <ClienteDetalle
            cliente={seleccionado}
            citas={data.citas.filter((c) => c.clienteId === seleccionado.id)}
            onClose={() => setSeleccionado(null)}
            update={update}
          />
        )}
      </Sheet>
    </>
  );
}

function ClienteDetalle({
  cliente,
  citas,
  onClose,
  update,
}: {
  cliente: BarberClient;
  citas: { id: string; fecha: string; hora: string; servicioNombre: string; precio: number }[];
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [nombre, setNombre] = React.useState(cliente.nombre);
  const [telefono, setTelefono] = React.useState(cliente.telefono);
  const [notas, setNotas] = React.useState(cliente.notas ?? "");
  const [confirmando, setConfirmando] = React.useState(false);

  function guardarCampo(cambios: Partial<BarberClient>) {
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, clientes: b.clientes.map((c) => (c.id === cliente.id ? { ...c, ...cambios } : c)) } };
    });
  }

  function eliminar() {
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, clientes: b.clientes.filter((c) => c.id !== cliente.id) } };
    });
    setConfirmando(false);
    onClose();
  }

  return (
    <>
      <SheetHeader title="Editar cliente" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={() => nombre.trim() && guardarCampo({ nombre: nombre.trim() })}
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

        {cliente.telefono && (
          <Button asChild size="lg" variant="ledger">
            <a href={waLink(cliente.telefono, `Hola ${cliente.nombre}, ¿cómo estás?`)} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> Enviar WhatsApp
            </a>
          </Button>
        )}

        <div className="space-y-1.5">
          <Label>Notas</Label>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={() => guardarCampo({ notas })}
            placeholder="Preferencias, alergias, etc."
          />
        </div>

        <div className="space-y-1.5">
          <Label>Historial</Label>
          {citas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin citas registradas.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
              {citas
                .sort((a, b) => `${b.fecha}${b.hora}`.localeCompare(`${a.fecha}${a.hora}`))
                .map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>
                      {c.fecha} · {c.servicioNombre}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{formatMoney(c.precio)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmando(true)}
        >
          <Trash2 className="h-4 w-4" /> Eliminar cliente
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        title="Eliminar cliente"
        description={`Se borrará a ${cliente.nombre} de tu lista de clientes. Su historial de citas pasadas se conserva.`}
        onClose={() => setConfirmando(false)}
        onConfirm={eliminar}
      />
    </>
  );
}
