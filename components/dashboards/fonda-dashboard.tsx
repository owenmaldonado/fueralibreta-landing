"use client";

import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { StatTile } from "./stat-tile";
import { EmptyState } from "./empty-state";
import { CerrarTurnoSheet } from "./fonda-cerrar-turno";
import { formatMoney, formatHora12, toISODate, uid } from "@/lib/mock";
import { supabase } from "@/lib/supabase";
import { fetchPedidosPendientes } from "@/lib/data";
import { camposEmpleado } from "@/lib/empleados";
import type { TenantData, SessionUpdater, FondaOrder, Dish, DishVariant } from "@/lib/types";

type FiltroDia = "hoy" | "ayer" | "semana";

const FILTROS: { value: FiltroDia; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "semana", label: "Semana" },
];

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function FondaDashboard({ session, update }: { session: TenantData; update: SessionUpdater }) {
  const data = session.fonda!;
  const negocio = session.business;
  const [filtro, setFiltro] = React.useState<FiltroDia>("hoy");
  const [variantesSheet, setVariantesSheet] = React.useState<Dish | null>(null);
  const [cerrandoTurno, setCerrandoTurno] = React.useState(false);
  const activos = data.platillos.filter((p) => p.activoHoy);

  // Lectura directa a Supabase para "Hoy" en vez de fiarse del session.fonda
  // ya cargado (que solo se refresca al iniciar sesión): un pedido nuevo
  // insertado después de esa carga no aparecía hasta recargar la página.
  // Sin ningún filtro de fecha/hoy/fecha_entrega/created_at — solo
  // negocio_id + estado, tal como debe ser. Solo aplica a negocios reales
  // (ownerId presente): una demo sin reclamar (/demo/[tipo], sin sesión)
  // nunca se persiste en Supabase, así que esta consulta siempre volvería
  // vacía ahí — la demo sigue usando session.fonda.pedidos de localStorage.
  const esNegocioReal = Boolean(negocio.ownerId);
  const [pendientesVivo, setPendientesVivo] = React.useState<FondaOrder[]>([]);
  React.useEffect(() => {
    if (filtro !== "hoy" || !esNegocioReal) return;
    let cancelled = false;
    fetchPedidosPendientes(negocio.id)
      .then((pedidos) => {
        if (!cancelled) setPendientesVivo(pedidos);
      })
      .catch((err) => console.error("No se pudieron cargar los pedidos pendientes:", err));
    return () => {
      cancelled = true;
    };
  }, [negocio.id, negocio.ownerId, filtro, esNegocioReal]);

  // El fetch de arriba solo corre al montar/cambiar de tab — un "Nuevo
  // Pedido" agregado después desde el FAB (mismo tab del navegador) no lo
  // vuelve a disparar, así que no aparecía en Hoy hasta recargar. update()
  // SÍ actualiza session.fonda.pedidos al instante en toda pantalla abierta
  // (ver TENANT_CACHE_EVENT en lib/session.ts) — este efecto reconcilia
  // pendientesVivo contra eso en cada cambio: agrega los pedidos nuevos que
  // este tab acaba de crear y no estaban en el fetch original, y quita los
  // que este tab sepa que ya se marcaron entregados (desde aquí mismo o
  // desde /app/pedidos). Los pedidos de OTRO dispositivo que este tab
  // nunca sincronizó (sin realtime para fonda_pedidos) se conservan tal
  // cual — ausentes de session.fonda no es lo mismo que "ya entregados".
  React.useEffect(() => {
    if (filtro !== "hoy" || !esNegocioReal) return;
    setPendientesVivo((prev) => {
      const yaNoPendientes = new Set(data.pedidos.filter((p) => p.estado !== "pendiente").map((p) => p.id));
      const conservados = prev.filter((p) => !yaNoPendientes.has(p.id));
      const idsConservados = new Set(conservados.map((p) => p.id));
      const nuevosLocales = data.pedidos.filter((p) => p.estado === "pendiente" && !idsConservados.has(p.id));
      return nuevosLocales.length === 0 && conservados.length === prev.length ? prev : [...nuevosLocales, ...conservados];
    });
  }, [data.pedidos, filtro, esNegocioReal]);

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

  // "Hoy" en un negocio real muestra pendientesVivo (lectura directa,
  // siempre al día). En demo (sin ownerId, nunca persistida) cae a
  // session.fonda.pedidos filtrado solo por estado, igual que antes.
  // "Ayer" y "Semana" siguen con session.fonda.pedidos filtrado por fecha
  // — ahí el punto es revisar histórico, no lo pendiente de ahora mismo.
  const pedidosPeriodo =
    filtro === "hoy"
      ? esNegocioReal
        ? pendientesVivo
        : data.pedidos.filter((p) => p.estado === "pendiente")
      : data.pedidos.filter((p) => p.fecha >= desde && p.fecha <= hasta).sort((a, b) => a.hora.localeCompare(b.hora));
  const pendientesPeriodo = pedidosPeriodo.filter((p) => p.estado === "pendiente");

  const tituloHoy = `Hoy es ${new Date(`${hoyEnSuZona}T00:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
  })}`;

  async function marcarEntregado(id: string) {
    if (esNegocioReal) {
      setPendientesVivo((prev) => prev.filter((p) => p.id !== id));
      const { error } = await supabase.from("fonda_pedidos").update({ estado: "entregado" }).eq("id", id);
      if (error) console.error("No se pudo marcar el pedido como entregado:", error);
    }
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, pedidos: f.pedidos.map((p) => (p.id === id ? { ...p, estado: "entregado" as const } : p)) } };
    });
  }

  // Venta rápida desde los botones de Hoy: mismo flujo que "Cobrar ahora"
  // del formulario de Nuevo Pedido (pedido ya entregado, no pasa por
  // pendientes) — un tap agrega directo si el platillo no tiene variantes,
  // o crea el pedido con la variante elegida en el bottom-sheet.
  function onTapPlatillo(platillo: Dish) {
    const disponibles = (platillo.variantes ?? []).filter((v) => v.disponible);
    if (disponibles.length > 0) {
      setVariantesSheet(platillo);
    } else {
      venderRapido(platillo);
    }
  }

  function venderRapido(platillo: Dish, variante?: DishVariant) {
    const precio = platillo.precio + (variante?.precioExtra ?? 0);
    update((prev) => {
      const f = prev.fonda!;
      const pedido: FondaOrder = {
        id: uid("ped"),
        clienteNombre: "Venta rápida",
        fecha: hoyEnSuZona,
        hora: nowHHMM(),
        items: [
          {
            id: uid("it"),
            platilloId: platillo.id,
            platilloNombre: platillo.nombre,
            cantidad: 1,
            varianteNombre: variante?.valor,
            precioUnitario: precio,
            costoUnitario: platillo.costo,
          },
        ],
        estado: "entregado",
        total: precio,
        ...camposEmpleado(),
      };
      return { ...prev, fonda: { ...f, pedidos: [pedido, ...f.pedidos] } };
    });
    setVariantesSheet(null);
  }

  return (
    <>
      <PageHeader
        title={tituloHoy}
        subtitle="Pedidos y ventas de la fonda"
        action={
          filtro === "hoy" ? (
            <Button size="sm" variant="outline" onClick={() => setCerrandoTurno(true)}>
              Cerrar turno
            </Button>
          ) : undefined
        }
      />
      <div className="px-4">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as FiltroDia)} tabs={FILTROS} />
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pt-4">
        <StatTile label="Ventas" value={formatMoney(ventas)} />
        <StatTile label="Gastos" value={formatMoney(gastos)} />
      </div>
      {filtro === "hoy" && activos.length > 0 && (
        <div className="px-4 pt-5">
          <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Venta rápida</p>
          <div className="grid grid-cols-2 gap-2">
            {activos.map((p) => (
              <button
                key={p.id}
                onClick={() => onTapPlatillo(p)}
                className="rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 active:scale-[0.98]"
              >
                <p className="text-sm font-semibold">{p.nombre}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{formatMoney(p.precio)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
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
                        {it.varianteNombre && ` c/ ${it.varianteNombre}`}
                        {it.nota && <span className="ml-1 font-medium text-destructive">· {it.nota}</span>}
                        {it.extraMonto != null && (
                          <span className="ml-1 font-medium text-primary">
                            · +{formatMoney(it.extraMonto)} {it.extraConcepto}
                          </span>
                        )}
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

      <Sheet open={!!variantesSheet} onOpenChange={(o) => !o && setVariantesSheet(null)}>
        {variantesSheet && (
          <>
            <SheetHeader title="¿Con qué?" description={variantesSheet.nombre} onClose={() => setVariantesSheet(null)} />
            <div className="flex flex-col gap-2">
              {(variantesSheet.variantes ?? [])
                .filter((v) => v.disponible)
                .map((v) => (
                  <Button
                    key={v.id}
                    size="lg"
                    variant="outline"
                    className="justify-between"
                    onClick={() => venderRapido(variantesSheet, v)}
                  >
                    <span>{v.valor}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatMoney(variantesSheet.precio + v.precioExtra)}
                    </span>
                  </Button>
                ))}
            </div>
          </>
        )}
      </Sheet>

      <CerrarTurnoSheet open={cerrandoTurno} onClose={() => setCerrandoTurno(false)} session={session} update={update} hoyEnSuZona={hoyEnSuZona} />
    </>
  );
}
