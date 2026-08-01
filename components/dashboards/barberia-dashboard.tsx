"use client";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ActionCard } from "./action-card";
import { EmptyState } from "./empty-state";
import { daysSince, formatMoney, todayISO, waLink } from "@/lib/mock";
import type { TenantData, SessionUpdater } from "@/lib/types";

export function BarberiaDashboard({ session, update }: { session: TenantData; update: SessionUpdater }) {
  const data = session.barberia!;
  const business = session.business;
  const hoy = todayISO(0);

  const citasHoy = data.citas
    .filter((c) => c.fecha === hoy && c.estado === "pendiente")
    .sort((a, b) => a.hora.localeCompare(b.hora));

  const clientesAlerta = data.clientes.filter((c) => {
    const d = daysSince(c.ultimaVisita);
    return d !== null && d >= 30;
  });

  const hoyMMDD = new Date().toISOString().slice(5, 10);
  const cumples = data.clientes.filter((c) => c.cumpleanos === hoyMMDD);
  const productosBajos = data.productos.filter((p) => p.stock <= p.minimo);

  const nada = citasHoy.length === 0 && clientesAlerta.length === 0 && cumples.length === 0 && productosBajos.length === 0;

  function marcarListo(citaId: string) {
    update((prev) => {
      const b = prev.barberia!;
      return { ...prev, barberia: { ...b, citas: b.citas.map((c) => (c.id === citaId ? { ...c, estado: "listo" as const } : c)) } };
    });
  }

  return (
    <>
      <PageHeader title={`Hola, ${business.dueno.split(" ")[0]}`} subtitle="Esto necesita tu atención hoy" />
      <div className="flex flex-col gap-3 px-4 pb-6">
        {citasHoy.length > 0 && (
          <ActionCard
            level="red"
            title={`Tienes ${citasHoy.length} cita${citasHoy.length > 1 ? "s" : ""} hoy`}
            subtitle={citasHoy.map((c) => `${c.hora} ${c.clienteNombre}`).join(" · ")}
            actions={[{ label: "Ir", href: "/app/agenda" }]}
          />
        )}
        {cumples.map((c) => (
          <ActionCard
            key={c.id}
            level="red"
            title={`Hoy cumple ${c.nombre}`}
            actions={[
              {
                label: "Felicitar",
                href: waLink(c.telefono, `¡Feliz cumpleaños ${c.nombre}! De parte de todo el equipo de ${business.nombre} 🎉`),
              },
            ]}
          />
        ))}
        {clientesAlerta.map((c) => (
          <ActionCard
            key={c.id}
            level="yellow"
            title={`${c.nombre} · ${daysSince(c.ultimaVisita)} días sin venir`}
            actions={[
              {
                label: "WhatsApp",
                href: waLink(
                  c.telefono,
                  `Hola ${c.nombre}, ¡te extrañamos en ${business.nombre}! ¿Cuándo te agendamos tu próximo corte?`
                ),
              },
            ]}
          />
        ))}
        {productosBajos.map((p) => (
          <ActionCard key={p.id} level="yellow" title={`Quedan ${p.stock} ${p.nombre}`} actions={[{ label: "Ir", href: "/app/mas" }]} />
        ))}
        {nada && <EmptyState />}

        {citasHoy.length > 0 && (
          <div className="mt-2">
            <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Citas de hoy</p>
            <div className="flex flex-col gap-2">
              {citasHoy.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {c.hora} · {c.clienteNombre}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.servicioNombre} · {formatMoney(c.precio)}
                    </p>
                  </div>
                  <Button size="sm" variant="ledger" onClick={() => marcarListo(c.id)}>
                    ✔️ Listo
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
