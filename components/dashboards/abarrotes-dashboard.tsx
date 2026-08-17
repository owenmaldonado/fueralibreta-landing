"use client";

import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ActionCard } from "./action-card";
import { EmptyState } from "./empty-state";
import { StatTile } from "./stat-tile";
import { CerrarDiaSheet } from "./abarrotes-cerrar-dia";
import { formatMoney, fechaCalendarioLocal, todayISO, waLink } from "@/lib/mock";
import { avisosIgnoradosHoy, ignorarAvisoHoy } from "@/lib/dismissed-alerts";
import type { TenantData, SessionUpdater } from "@/lib/types";

export function AbarrotesDashboard({ session, update }: { session: TenantData; update: SessionUpdater }) {
  const data = session.abarrotes!;
  const hoy = todayISO(0);
  const [cerrandoDia, setCerrandoDia] = React.useState(false);
  const [ignorados, setIgnorados] = React.useState<Set<string>>(() => avisosIgnoradosHoy(session.business.id));

  function ignorar(id: string) {
    ignorarAvisoHoy(session.business.id, id);
    setIgnorados((prev) => new Set(prev).add(id));
  }

  // Frutas y Verdura no se reabastece desde Inventario (tiene su propio
  // panel), así que no manda aquí a un link que ya no las muestra.
  const bajos = data.productos.filter((p) => !p.isVolatile && p.stock <= p.minimo && !ignorados.has(`bajo-${p.id}`));
  const porCaducar = data.productos.filter((p) => p.porCaducar && !ignorados.has(`caducar-${p.id}`));
  const fiadosConSaldo = data.fiados.filter((f) => f.saldo > 0 && !ignorados.has(`fiado-${f.id}`));
  const gastosPendientes = data.gastos.filter((g) => g.recordatorio && !ignorados.has(`gasto-${g.id}`));
  // abarrotes_ventas.fecha es timestamptz en UTC — fechaCalendarioLocal lo
  // convierte al día calendario del dispositivo (no una zona hardcodeada)
  // antes de comparar, para que una venta ya tarde en el día no cuente
  // como "de mañana" ni "Ventas de hoy" salga en $0.
  const ventasHoy = data.ventas
    .filter((v) => fechaCalendarioLocal(v.fecha) === hoy)
    .reduce((acc, v) => acc + v.total, 0);

  const nada = bajos.length === 0 && porCaducar.length === 0 && fiadosConSaldo.length === 0 && gastosPendientes.length === 0;

  return (
    <>
      <PageHeader
        title="Hoy"
        subtitle="Pendientes de tu negocio"
        action={
          <Button size="sm" variant="outline" onClick={() => setCerrandoDia(true)}>
            Cerrar día
          </Button>
        }
      />
      <div className="px-4">
        <StatTile label="Ventas hoy" value={formatMoney(ventasHoy)} />
      </div>
      <div className="flex flex-col gap-3 px-4 py-6">
        {porCaducar.map((p) => (
          <ActionCard
            key={p.id}
            level="yellow"
            title={`POR CADUCAR: ${p.nombre}`}
            actions={[{ label: "Ir a Inventario", href: "/app/inventario" }]}
            onDismiss={() => ignorar(`caducar-${p.id}`)}
          />
        ))}
        {bajos.map((p) => (
          <ActionCard
            key={p.id}
            level="yellow"
            title={`Quedan ${p.stock} ${p.nombre}`}
            actions={[{ label: "Reabastecer", href: "/app/inventario" }]}
            onDismiss={() => ignorar(`bajo-${p.id}`)}
          />
        ))}
        {fiadosConSaldo.map((f) => (
          <ActionCard
            key={f.id}
            level="yellow"
            title={`${f.clienteNombre} debe ${formatMoney(f.saldo)}`}
            actions={[{ label: "WhatsApp", href: waLink(f.telefono, `Hola ${f.clienteNombre}, te recuerdo tu saldo de $${f.saldo}`) }]}
            onDismiss={() => ignorar(`fiado-${f.id}`)}
          />
        ))}
        {gastosPendientes.map((g) => (
          <ActionCard
            key={g.id}
            level="yellow"
            title={`Pagar ${g.categoria} el ${g.fecha}`}
            actions={[{ label: "Ir", href: "/app/gastos" }]}
            onDismiss={() => ignorar(`gasto-${g.id}`)}
          />
        ))}
        {nada && <EmptyState texto="Todo bajo control 🎉" />}
      </div>

      <CerrarDiaSheet open={cerrandoDia} onClose={() => setCerrandoDia(false)} session={session} update={update} />
    </>
  );
}
