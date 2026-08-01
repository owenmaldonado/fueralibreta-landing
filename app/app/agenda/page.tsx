"use client";

import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/dashboards/empty-state";
import { useSession } from "@/lib/session";
import { formatMoney, todayISO, waLink } from "@/lib/mock";
import type { AppointmentStatus } from "@/lib/types";

export default function AgendaPage() {
  const { session, ready, update } = useSession();
  const [fecha, setFecha] = React.useState(todayISO(0));

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  const citas = data.citas
    .filter((c) => c.fecha === fecha && c.estado !== "cancelada")
    .sort((a, b) => a.hora.localeCompare(b.hora));

  function marcar(id: string, estado: AppointmentStatus) {
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, citas: b.citas.map((c) => (c.id === id ? { ...c, estado } : c)) } };
    });
  }

  return (
    <>
      <PageHeader title="Agenda" subtitle={fecha === todayISO(0) ? "Hoy" : new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" })} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <ChipGroup>
          <Chip selected={fecha === todayISO(0)} onClick={() => setFecha(todayISO(0))}>
            Hoy
          </Chip>
          <Chip selected={fecha === todayISO(1)} onClick={() => setFecha(todayISO(1))}>
            Mañana
          </Chip>
        </ChipGroup>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-full border border-border bg-transparent px-4 py-2 text-sm text-muted-foreground"
        />
      </div>
      <div className="flex flex-col gap-2 px-4 pb-6">
        {citas.length === 0 ? (
          <EmptyState texto="Sin citas para este día" />
        ) : (
          citas.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="w-14 shrink-0 font-mono text-sm text-primary">{c.hora}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.clienteNombre}</p>
                <p className="text-xs text-muted-foreground">
                  {c.servicioNombre} · {formatMoney(c.precio)}
                </p>
              </div>
              {c.estado === "pendiente" ? (
                <Button size="sm" variant="ledger" onClick={() => marcar(c.id, "listo")}>
                  ✔️ Listo
                </Button>
              ) : (
                <span className="shrink-0 font-mono text-xs uppercase tracking-widest text-ledger">Listo</span>
              )}
              <DropdownMenu
                items={[
                  ...(c.clienteTelefono
                    ? [
                        {
                          label: "WhatsApp",
                          onClick: () =>
                            window.open(
                              waLink(c.clienteTelefono, `Hola ${c.clienteNombre}, te confirmamos tu cita a las ${c.hora}`),
                              "_blank"
                            ),
                        },
                      ]
                    : []),
                  { label: "Cancelar cita", danger: true, onClick: () => marcar(c.id, "cancelada") },
                ]}
              />
            </div>
          ))
        )}
      </div>
    </>
  );
}
