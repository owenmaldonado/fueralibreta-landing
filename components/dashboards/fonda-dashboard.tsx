"use client";

import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { StatTile } from "./stat-tile";
import { EmptyState } from "./empty-state";
import { formatMoney, formatHora12, toISODate, todayISOEnTepic } from "@/lib/mock";
import type { TenantData, SessionUpdater } from "@/lib/types";

const TEPIC_TZ = "America/Bahia_Banderas";

/** "Hoy es {día} {número}" según la zona horaria del negocio (Tepic), no la del dispositivo que esté viendo el panel. */
function tituloHoy(): string {
  const partes = new Intl.DateTimeFormat("es-MX", { timeZone: TEPIC_TZ, weekday: "long", day: "numeric" }).formatToParts(
    new Date()
  );
  const dia = partes.find((p) => p.type === "weekday")?.value ?? "";
  const numero = partes.find((p) => p.type === "day")?.value ?? "";
  return `Hoy es ${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${numero}`;
}

/** Lunes a domingo de la semana de calendario en curso, anclada al "hoy" de Tepic (misma definición que "Semanal" en la gráfica de Gastos). */
function rangoSemanaActual(): [string, string] {
  const hoy = new Date(`${todayISOEnTepic(0)}T00:00:00`);
  const diasDesdeLunes = (hoy.getDay() + 6) % 7;
  const lunes = new Date(hoy);
  lunes.setDate(lunes.getDate() - diasDesdeLunes);
  const domingo = new Date(lunes);
  domingo.setDate(domingo.getDate() + 6);
  return [toISODate(lunes), toISODate(domingo)];
}

type FiltroDia = "hoy" | "ayer" | "semana";

const FILTROS: { value: FiltroDia; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "semana", label: "Semana" },
];

export function FondaDashboard({ session, update }: { session: TenantData; update: SessionUpdater }) {
  const data = session.fonda!;
  const [filtro, setFiltro] = React.useState<FiltroDia>("hoy");

  const [desde, hasta] =
    filtro === "hoy"
      ? [todayISOEnTepic(0), todayISOEnTepic(0)]
      : filtro === "ayer"
        ? [todayISOEnTepic(-1), todayISOEnTepic(-1)]
        : rangoSemanaActual();

  // En "Hoy" un pedido pendiente SIEMPRE se muestra, sin importar qué fecha
  // tenga guardada — un pedido tomado cerca de medianoche desde el link
  // público (el huso del celular del cliente puede no ser el de Tepic) no
  // debe desaparecer del panel solo por un desfase de un día. "Ayer" y
  // "Semana" sí siguen filtrando por fecha porque ahí el punto es revisar
  // el histórico, no lo pendiente de ahora.
  const pedidosPeriodo = (
    filtro === "hoy"
      ? data.pedidos.filter((p) => p.estado === "pendiente" || (p.fecha >= desde && p.fecha <= hasta))
      : data.pedidos.filter((p) => p.fecha >= desde && p.fecha <= hasta)
  ).sort((a, b) => a.hora.localeCompare(b.hora));
  const gastosPeriodo = data.gastos.filter((g) => g.fecha >= desde && g.fecha <= hasta);

  // Solo cuenta como venta un pedido ya entregado, no uno pendiente.
  const ventas = pedidosPeriodo.filter((p) => p.estado === "entregado").reduce((acc, p) => acc + p.total, 0);
  const gastos = gastosPeriodo.reduce((acc, g) => acc + g.monto, 0);
  const pendientesPeriodo = pedidosPeriodo.filter((p) => p.estado === "pendiente");

  function marcarEntregado(id: string) {
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, pedidos: f.pedidos.map((p) => (p.id === id ? { ...p, estado: "entregado" as const } : p)) } };
    });
  }

  return (
    <>
      <PageHeader title={tituloHoy()} subtitle="Pedidos y ventas de la fonda" />
      <div className="px-4">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as FiltroDia)} tabs={FILTROS} />
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pt-4">
        <StatTile label="Ventas" value={formatMoney(ventas)} />
        <StatTile label="Gastos" value={formatMoney(gastos)} />
      </div>
      <div className="flex flex-col gap-3 px-4 py-6">
        <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Pedidos · {pedidosPeriodo.length} ({pendientesPeriodo.length} pendientes)
        </p>
        {pedidosPeriodo.length === 0 ? (
          <EmptyState texto="Sin pedidos en este periodo" />
        ) : (
          pedidosPeriodo.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {p.hora} · {p.clienteNombre}
                  </p>
                  {p.horaEntrega && (
                    <p className="mt-0.5 text-xs font-medium text-primary">Entrega: {formatHora12(p.horaEntrega)}</p>
                  )}
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {p.items.map((it) => (
                      <li key={it.id}>
                        {it.cantidad}× {it.platilloNombre}
                        {it.nota && <span className="ml-1 font-medium text-destructive">· {it.nota}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-sm">{formatMoney(p.total)}</span>
                  {p.estado === "entregado" && (
                    <span className="rounded-full bg-ledger/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-ledger">
                      entregado
                    </span>
                  )}
                </div>
              </div>
              {p.estado === "pendiente" && (
                <Button size="sm" variant="ledger" className="mt-3 w-full" onClick={() => marcarEntregado(p.id)}>
                  ✔️ Entregado
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
