"use client";

import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ActionCard } from "./action-card";
import { EmptyState } from "./empty-state";
import { CobrarCitaDialog } from "./cobrar-cita-dialog";
import { CerrarTurnoSheet } from "./barberia-cerrar-turno";
import { daysSince, formatHora12, formatMoney, statsVisitasCliente, todayISO, waLink } from "@/lib/mock";
import { camposEmpleado } from "@/lib/empleados";
import { encolarVentaPendiente } from "@/lib/offline-sales-queue";
import { avisosIgnoradosHoy, ignorarAvisoHoy } from "@/lib/dismissed-alerts";
import type { Appointment, TenantData, SessionUpdater } from "@/lib/types";

export function BarberiaDashboard({ session, update }: { session: TenantData; update: SessionUpdater }) {
  const data = session.barberia!;
  const business = session.business;
  const hoy = todayISO(0);
  const [cobrando, setCobrando] = React.useState<Appointment | null>(null);
  const [cerrandoTurno, setCerrandoTurno] = React.useState(false);
  const [ignorados, setIgnorados] = React.useState<Set<string>>(() => avisosIgnoradosHoy(business.id));

  function ignorar(id: string) {
    ignorarAvisoHoy(business.id, id);
    setIgnorados((prev) => new Set(prev).add(id));
  }

  const citasHoy = data.citas
    .filter((c) => c.fecha === hoy && c.estado === "pendiente")
    .sort((a, b) => a.hora.localeCompare(b.hora));

  const clientesAlerta = data.clientes
    .map((c) => ({ ...c, ...statsVisitasCliente(data.citas, c.id) }))
    .filter((c) => {
      const d = daysSince(c.ultimaVisita);
      return d !== null && d >= 28;
    })
    .filter((c) => !ignorados.has(`alerta-${c.id}`));

  const hoyMMDD = new Date().toISOString().slice(5, 10);
  const cumples = data.clientes.filter((c) => c.cumpleanos === hoyMMDD);
  const productosBajos = data.productos.filter((p) => p.stock <= p.minimo && !ignorados.has(`bajo-${p.id}`));

  const nada = citasHoy.length === 0 && clientesAlerta.length === 0 && cumples.length === 0 && productosBajos.length === 0;

  function marcarListoConMetodo(citaId: string, metodo: "efectivo" | "transferencia") {
    let negocioId = "";
    update(
      (prev) => {
        const b = prev.barberia!;
        negocioId = prev.business.id;
        return {
          ...prev,
          barberia: {
            ...b,
            citas: b.citas.map((c) => (c.id === citaId ? { ...c, estado: "listo" as const, metodo, ...camposEmpleado() } : c)),
          },
        };
      },
      { ventaOffline: true }
    );
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      encolarVentaPendiente({
        id: citaId,
        negocioId,
        tipo: "barberia_cobro_cita",
        payload: { citaId, metodo },
        ...camposEmpleado(),
      }).catch((err) => console.error("No se pudo encolar la venta pendiente:", err));
    }
    setCobrando(null);
  }

  return (
    <>
      <PageHeader
        title={`Hola, ${business.dueno.split(" ")[0]}`}
        subtitle="Esto necesita tu atención hoy"
        action={
          <Button size="sm" variant="outline" onClick={() => setCerrandoTurno(true)}>
            Cerrar turno
          </Button>
        }
      />
      <div className="flex flex-col gap-3 px-4 pb-6">
        {citasHoy.length > 0 && (
          <ActionCard
            level="red"
            title={`Tienes ${citasHoy.length} cita${citasHoy.length > 1 ? "s" : ""} hoy`}
            subtitle={citasHoy.map((c) => `${formatHora12(c.hora)} ${c.clienteNombre}`).join(" · ")}
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
            onDismiss={() => ignorar(`alerta-${c.id}`)}
          />
        ))}
        {productosBajos.map((p) => (
          <ActionCard
            key={p.id}
            level="yellow"
            title={`Quedan ${p.stock} ${p.nombre}`}
            actions={[{ label: "Ir", href: "/app/mas" }]}
            onDismiss={() => ignorar(`bajo-${p.id}`)}
          />
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
                      {formatHora12(c.hora)} · {c.clienteNombre}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.servicioNombre} · {formatMoney(c.precio)}
                    </p>
                  </div>
                  <Button size="sm" variant="ledger" onClick={() => setCobrando(c)}>
                    ✔️ Listo
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <CobrarCitaDialog cita={cobrando} onClose={() => setCobrando(null)} onConfirmar={marcarListoConMetodo} />

      <CerrarTurnoSheet open={cerrandoTurno} onClose={() => setCerrandoTurno(false)} session={session} update={update} />
    </>
  );
}
