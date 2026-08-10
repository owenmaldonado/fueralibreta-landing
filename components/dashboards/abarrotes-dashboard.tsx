"use client";

import { PageHeader } from "@/components/app-shell/page-header";
import { ActionCard } from "./action-card";
import { EmptyState } from "./empty-state";
import { StatTile } from "./stat-tile";
import { formatMoney, todayISO, waLink } from "@/lib/mock";
import type { TenantData, SessionUpdater } from "@/lib/types";

export function AbarrotesDashboard({ session }: { session: TenantData; update: SessionUpdater }) {
  const data = session.abarrotes!;
  const hoy = todayISO(0);

  // Frutas y Verdura no se reabastece desde Inventario (tiene su propio
  // panel), así que no manda aquí a un link que ya no las muestra.
  const bajos = data.productos.filter((p) => !p.isVolatile && p.stock <= p.minimo);
  const fiadosConSaldo = data.fiados.filter((f) => f.saldo > 0);
  const gastosPendientes = data.gastos.filter((g) => g.recordatorio);
  const ventasHoy = data.ventas.filter((v) => v.fecha.slice(0, 10) === hoy).reduce((acc, v) => acc + v.total, 0);

  const nada = bajos.length === 0 && fiadosConSaldo.length === 0 && gastosPendientes.length === 0;

  return (
    <>
      <PageHeader title="Hoy" subtitle="Pendientes de tu negocio" />
      <div className="px-4">
        <StatTile label="Ventas hoy" value={formatMoney(ventasHoy)} />
      </div>
      <div className="flex flex-col gap-3 px-4 py-6">
        {bajos.map((p) => (
          <ActionCard key={p.id} level="yellow" title={`Quedan ${p.stock} ${p.nombre}`} actions={[{ label: "Reabastecer", href: "/app/inventario" }]} />
        ))}
        {fiadosConSaldo.map((f) => (
          <ActionCard
            key={f.id}
            level="yellow"
            title={`${f.clienteNombre} debe ${formatMoney(f.saldo)}`}
            actions={[{ label: "WhatsApp", href: waLink(f.telefono, `Hola ${f.clienteNombre}, te recuerdo tu saldo de $${f.saldo}`) }]}
          />
        ))}
        {gastosPendientes.map((g) => (
          <ActionCard key={g.id} level="yellow" title={`Pagar ${g.categoria} el ${g.fecha}`} actions={[{ label: "Ir", href: "/app/gastos" }]} />
        ))}
        {nada && <EmptyState texto="Todo bajo control 🎉" />}
      </div>
    </>
  );
}
