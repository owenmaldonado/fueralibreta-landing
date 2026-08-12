"use client";

import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { StatTile } from "./stat-tile";
import { EmptyState } from "./empty-state";
import { formatMoney, formatHora12, toISODate } from "@/lib/mock";
import type { TenantData, SessionUpdater } from "@/lib/types";

type FiltroDia = "hoy" | "ayer" | "semana";

const FILTROS: { value: FiltroDia; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "semana", label: "Semana" },
];

export function FondaDashboard({ session, update }: { session: TenantData; update: SessionUpdater }) {
  const data = session.fonda!;
  const negocio = session.business;
  const [filtro, setFiltro] = React.useState<FiltroDia>("hoy");

  const hoyEnSuZona = new Date().toLocaleDateString("en-CA", { timeZone: negocio.timezone || "America/Bahia_Banderas" });
  const ayerEnSuZona = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", {
    timeZone: negocio.timezone || "America/Bahia_Banderas",
  });

  // Lunes a domingo de la semana de calendario en curso, anclada a hoyEnSuZona (misma definición que "Semanal" en la gráfica de Gastos).
  const [semanaDesde, semanaHasta] = (() => {
    const hoy = new Date(`${hoyEnSuZona}T00:00:00`);
    const diasDesdeLunes = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(lunes.getDate() - diasDesdeLunes);
    const domingo = new Date(lunes);
    domingo.setDate(domingo.getDate() + 6);
    return [toISODate(lunes), toISODate(domingo)];
  })();

  const [desde, hasta] =
    filtro === "hoy" ? [hoyEnSuZona, hoyEnSuZona] : filtro === "ayer" ? [ayerEnSuZona, ayerEnSuZona] : [semanaDesde, semanaHasta];

  const gastosPeriodo = data.gastos.filter((g) => g.fecha >= desde && g.fecha <= hasta);
  const ventas = data.pedidos
    .filter((p) => p.estado === "entregado" && p.fecha >= desde && p.fecha <= hasta)
    .reduce((acc, p) => acc + p.total, 0);
  const gastos = gastosPeriodo.reduce((acc, g) => acc + g.monto, 0);

  // La lista de pedidos en "Hoy" ya no filtra por fecha, solo por estado —
  // un pendiente se muestra siempre, sin importar qué fecha tenga guardada
  // (un pedido tomado cerca de medianoche desde el link público no debe
  // desaparecer del panel solo por un desfase de huso horario). "Ventas"
  // arriba sigue sumando lo entregado de hoy aparte, sin depender de esta
  // lista. "Ayer" y "Semana" sí siguen filtrando por fecha — ahí el punto
  // es revisar histórico, no lo pendiente de ahora.
  const pedidosPeriodo = (
    filtro === "hoy"
      ? data.pedidos.filter((p) => p.estado === "pendiente")
      : data.pedidos.filter((p) => p.fecha >= desde && p.fecha <= hasta)
  ).sort((a, b) => a.hora.localeCompare(b.hora));
  const pendientesPeriodo = pedidosPeriodo.filter((p) => p.estado === "pendiente");

  const tituloHoy = `Hoy es ${new Date(`${hoyEnSuZona}T00:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
  })}`;

  function marcarEntregado(id: string) {
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, pedidos: f.pedidos.map((p) => (p.id === id ? { ...p, estado: "entregado" as const } : p)) } };
    });
  }

  return (
    <>
      <PageHeader title={tituloHoy} subtitle="Pedidos y ventas de la fonda" />
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
