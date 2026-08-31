"use client";

import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { StatTile } from "./stat-tile";
import { EmptyState } from "./empty-state";
import { BloqueoPlan } from "./bloqueo-plan";
import { EmpleadoBadge } from "./empleado-badge";
import { VentasPorEmpleado } from "./ventas-por-empleado";
import { formatMoney, formatHora12, uid } from "@/lib/mock";
import { useHoy } from "@/lib/use-hoy";
import { horaActualEnZona } from "@/lib/fecha";
import { diaRelativo, semanaDe, diaDelNegocio } from "@/lib/chart-buckets";
import { supabase } from "@/lib/supabase";
import { fetchPedidosPendientes } from "@/lib/data";
import { camposEmpleado } from "@/lib/empleados";
import { usePlan } from "@/lib/planes";
import { obtenerOCrearTurno } from "@/lib/turno-fonda";
import { enTurnoActual as enTurnoActualCompartido, gastoEnTurnoActual, huboCierreHoy, desdeCuandoCuenta } from "@/lib/turno";
import { encolarVentaPendiente } from "@/lib/offline-sales-queue";
import { cn } from "@/lib/utils";
import type { TenantData, SessionUpdater, FondaOrder, Dish, DishVariant } from "@/lib/types";

type FiltroDia = "hoy" | "ayer" | "semana";

const FILTROS: { value: FiltroDia; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "semana", label: "Semana" },
];

/** Hora del NEGOCIO, no la del dispositivo — misma razón que la fecha (useHoy más abajo): un celular en otra zona guardaba la venta con una hora que no era la de la fonda. */
function nowHHMM(timezone?: string) {
  return horaActualEnZona(timezone);
}

export function FondaDashboard({ session, update }: { session: TenantData; update: SessionUpdater }) {
  const data = session.fonda!;
  const negocio = session.business;
  const plan = usePlan();
  const [filtro, setFiltro] = React.useState<FiltroDia>("hoy");
  const [variantesSheet, setVariantesSheet] = React.useState<Dish | null>(null);
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
  // desde /app/pedidos). Pedidos de OTRO dispositivo (ej. un vendedor en su
  // propia sesión) ya llegan por el canal de realtime de fonda_pedidos (PR
  // #119, ver escucharPedidosEnVivo en lib/session.ts) y entran a
  // session.fonda.pedidos solos — este efecto es el respaldo por si ese
  // canal tarda o se cae: mientras tanto, conserva lo que ya se pintó aquí
  // en vez de asumir "ausente de session.fonda" == "ya entregado".
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

  // useHoy en vez de hoyEnZona(): ESTE es el componente donde se reportó
  // "la gráfica semanal se reseteaba y se iba para otro día". La fonda deja
  // la tablet prendida desde antes de abrir hasta después de cerrar; al
  // cruzar la medianoche `hoyEnSuZona` se quedaba en el día anterior hasta
  // que un pedido nuevo (o un toque en la pantalla) forzaba el re-render, y
  // entonces TODO saltaba de día de golpe. Ver lib/use-hoy.ts.
  const hoyEnSuZona = useHoy(negocio.timezone);
  // "Ayer" y la semana Lun-Dom salen de aritmética de calendario sobre el
  // string de hoy (lib/chart-buckets.ts), no de objetos Date construidos con
  // `new Date(\`${hoy}T00:00:00\`)`. Ese constructor usa la zona del
  // DISPOSITIVO: en un celular que no está en la zona del negocio, "ayer" y
  // los límites de la semana podían salir corridos un día respecto de la
  // gráfica de Gastos, que sí trabaja en día del negocio. Es exactamente la
  // clase de desfase que se reportó como "todo se va al día anterior".
  const ayerEnSuZona = diaRelativo(hoyEnSuZona, -1);
  const { desde: semanaDesde, hasta: semanaHasta } = semanaDe(hoyEnSuZona);

  const [desde, hasta] =
    filtro === "hoy" ? [hoyEnSuZona, hoyEnSuZona] : filtro === "ayer" ? [ayerEnSuZona, ayerEnSuZona] : [semanaDesde, semanaHasta];

  // GASTOS DEL TURNO, no "todos los del día" (Owen: "en la misma fonda los
  // gastos no se van a 0, se cuenta lo de todo el día en vez de iniciar en
  // cero").
  //
  // "Ventas" ya arrancaba en cero en cada turno (enTurnoActual, abajo) pero
  // "Gastos" seguía sumando el día completo: al cerrar el turno de la mañana,
  // el de la tarde abría con Ventas $0 y Gastos con lo de la mañana todavía
  // adentro. Las dos tarjetas están una junto a la otra y decían cosas de
  // periodos distintos, así que la resta que hace el vendedor de cabeza nunca
  // le cuadraba.
  //
  // Solo aplica al filtro "Hoy" — ese es el que significa "el turno en curso".
  // "Ayer" y "Semana" son histórico: ahí sí se muestran todos los gastos del
  // periodo, igual que las ventas de esos mismos filtros.
  const gastosPeriodo =
    filtro === "hoy"
      ? data.gastos.filter((g) => gastoEnTurnoActual(g, negocio, hoyEnSuZona))
      : data.gastos.filter((g) => g.fecha >= desde && g.fecha <= hasta);
  const gastos = gastosPeriodo.reduce((acc, g) => acc + g.monto, 0);

  // Turno en curso del negocio — YA NO se basa en turnoId de localStorage
  // (lib/turno-fonda.ts, por DISPOSITIVO): eso hacía que "Ventas de hoy"
  // solo contara lo cobrado en ESE dispositivo en particular, así que un
  // vendedor cobrando en su propia tablet nunca sumaba en el dashboard del
  // dueño en otro dispositivo, aunque el pedido ya estuviera bien guardado
  // en Supabase. negocio.turnoFondaCerradoEn SÍ vive en `negocios` y llega
  // igual a todos los dispositivos por el canal de realtime que esa tabla
  // ya tiene (suscribirseANegocioEnVivo) — "el turno actual" es todo lo
  // entregado después del último cierre compartido (o desde el inicio de
  // hoy si nunca se ha cerrado uno todavía).
  //
  // Antes, cuando todavía no se había cerrado ningún turno, el arranque era
  // `new Date(\`${hoyEnSuZona}T00:00:00\`)`: la medianoche del DISPOSITIVO,
  // no la del negocio. En un celular en otra zona esa medianoche cae horas
  // antes o después de la real, así que "Ventas de hoy" incluía pedidos de
  // ayer o se dejaba fuera los de la madrugada. Ahora ese caso se resuelve
  // comparando el DÍA del negocio (string contra string) y solo el caso
  // "hay un cierre previo" compara instantes — que sí es lo correcto ahí,
  // porque un turno arranca en un momento exacto, no a medianoche.
  // ESTA COPIA LOCAL ERA EL BUG (Owen: "en fonda, en las ventas de la página
  // principal en vez de aparecer con 0 apareció con la cuenta de ayer, no se
  // reseteó").
  //
  // Fonda llevaba su propia versión de "¿esto entra en el turno?" mientras
  // barbería y abarrotera usaban lib/turno.ts. Dos copias de la misma regla
  // siempre terminan separándose, y esta se separó en dos puntos:
  //
  //   1. Solo miraba turnoFondaCerradoEn, no la marca genérica
  //      turnoCerradoEn que ahora usan los tres giros.
  //   2. Con un cierre previo comparaba `creadoEn >= cerradoEn` y ya. Nadie
  //      miraba el día: un cierre de ayer a las 8pm dejaba pasar los pedidos
  //      de ayer a las 8:30pm, hoy y todos los días siguientes. Eso es
  //      exactamente "aparece la cuenta de ayer".
  //
  // Ahora usa la misma función que los otros dos giros, que ya exige las dos
  // condiciones: de hoy Y posterior al último cierre.
  const enTurnoActual = (p: FondaOrder) =>
    enTurnoActualCompartido({ creadoEn: p.creadoEn, fecha: p.fecha }, negocio, hoyEnSuZona);

  // Los pedidos que de verdad son dinero cobrado en el periodo que se está
  // viendo. Una sola lista para el StatTile de "Ventas" Y para "Equipo hoy",
  // porque son la misma pregunta con distinto corte — si salen de listas
  // distintas se pueden contradecir, y se contradecían (ver equipoHoy abajo).
  const pedidosCobrados =
    filtro === "hoy"
      ? data.pedidos.filter((p) => p.estado === "entregado" && enTurnoActual(p))
      : data.pedidos.filter((p) => p.estado === "entregado" && p.fecha >= desde && p.fecha <= hasta);
  const ventas = pedidosCobrados.reduce((acc, p) => acc + p.total, 0);

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

  // "Equipo hoy" (PR #121, trazabilidad vendedor/encargado): quién vendió
  // qué en el turno — solo pedidos ya entregados (dinero de verdad cobrado),
  // y solo vale la pena mostrarlo si hay 2+ personas distintas
  // (VentasPorEmpleado se auto-oculta si no). "Sin dato" (negocio sin
  // multiusuario activo, o pedidos de antes de empleado_nombre_cache) cae a
  // "Dueño" — mismo criterio que fonda-cerrar-turno.tsx.
  //
  // ESTA TARJETA NUNCA SE VEÍA EN FONDITA. Salía de `pedidosPeriodo`, que en
  // el filtro "Hoy" son los pedidos PENDIENTES (viene de
  // fetchPedidosPendientes, que filtra estado = "pendiente", y el efecto de
  // arriba se encarga de sacar los que ya se entregaron). Pedirle a esa lista
  // los "entregado" da siempre cero filas, así que la tarjeta se auto-ocultaba
  // en el 100% de los casos y "quién vendió hoy" simplemente no existía en
  // Fondita, aunque Abarrotera y Barbería sí lo mostraran.
  //
  // Ahora sale de `pedidosCobrados`, la MISMA lista que alimenta el StatTile
  // de "Ventas" — así los nombres de aquí siempre suman el número de arriba.
  const equipoHoy =
    filtro === "hoy"
      ? Array.from(
          pedidosCobrados
            .reduce((mapa, p) => {
              const nombre = p.empleadoNombreCache ?? "Dueño";
              const actual = mapa.get(nombre) ?? { nombre, monto: 0, cantidad: 0 };
              mapa.set(nombre, { nombre, monto: actual.monto + p.total, cantidad: actual.cantidad + 1 });
              return mapa;
            }, new Map<string, { nombre: string; monto: number; cantidad: number }>())
            .values()
        )
      : [];

  const tituloHoy = `Hoy es ${new Date(`${hoyEnSuZona}T00:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
  })}`;

  async function marcarEntregado(id: string) {
    // Tagea con el turno en curso AL ENTREGAR (no al crear el pedido): un
    // pedido programado que se agendó en un turno anterior sí debe contar
    // en "Ventas" del turno donde de verdad se entrega — ver lib/turno-fonda.ts.
    const turno = obtenerOCrearTurno(negocio.id);
    if (esNegocioReal) {
      setPendientesVivo((prev) => prev.filter((p) => p.id !== id));
      const { error } = await supabase.from("fonda_pedidos").update({ estado: "entregado", turno_id: turno.turnoId }).eq("id", id);
      if (error) console.error("No se pudo marcar el pedido como entregado:", error);
    }
    update((prev) => {
      const f = prev.fonda!;
      return {
        ...prev,
        fonda: { ...f, pedidos: f.pedidos.map((p) => (p.id === id ? { ...p, estado: "entregado" as const, turnoId: turno.turnoId } : p)) },
      };
    });
  }

  // Mismo límite de pedidos/mes que NuevoPedidoForm (components/quick-add/
  // fonda-quick-add.tsx) — faltaba aquí: Venta rápida crea un pedido
  // "entregado" directo sin pasar por ese formulario, así que se podía
  // seguir vendiendo sin tope desde estos botones aunque el FAB ya bloqueara.
  const mesActual = hoyEnSuZona.slice(0, 7);
  const maxPedidos = plan.giroFonda.maxPedidos;
  const bloqueadoPorLimite = maxPedidos !== null && data.pedidos.filter((p) => p.fecha.startsWith(mesActual)).length >= maxPedidos;

  // Venta rápida desde los botones de Hoy: mismo flujo que "Cobrar ahora"
  // del formulario de Nuevo Pedido (pedido ya entregado, no pasa por
  // pendientes) — un tap agrega directo si el platillo no tiene variantes,
  // o crea el pedido con la variante elegida en el bottom-sheet.
  function onTapPlatillo(platillo: Dish) {
    if (bloqueadoPorLimite) return;
    const disponibles = (platillo.variantes ?? []).filter((v) => v.disponible);
    if (disponibles.length > 0) {
      setVariantesSheet(platillo);
    } else {
      venderRapido(platillo);
    }
  }

  // Mismo patrón que NuevoPedidoForm (components/quick-add/fonda-quick-add.tsx):
  // faltaba aquí, así que un tap sin conexión no hacía NADA — update() por
  // defecto rechaza cualquier cambio offline salvo que se marque
  // ventaOffline:true (ver lib/session.ts), y sin encolarVentaPendiente()
  // esa venta tampoco se subía sola al recuperar señal.
  function venderRapido(platillo: Dish, variante?: DishVariant) {
    if (bloqueadoPorLimite) return;
    const precio = platillo.precio + (variante?.precioExtra ?? 0);
    // Abre el turno aquí (no antes): recién con la PRIMERA venta real, para
    // no crear un turno_id "fantasma" solo por haber abierto la pantalla.
    const turno = obtenerOCrearTurno(negocio.id);
    const pedidoId = uid("ped");
    let pedidoCreado: FondaOrder | null = null;
    let negocioId = "";
    update(
      (prev) => {
        const f = prev.fonda!;
        const pedido: FondaOrder = {
          id: pedidoId,
          clienteNombre: "Venta rápida",
          fecha: hoyEnSuZona,
          hora: nowHHMM(negocio.timezone),
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
          turnoId: turno.turnoId,
          // creadoEn se pone AQUÍ, no solo en la base.
          //
          // Antes este campo lo llenaba únicamente created_at de Supabase,
          // así que un pedido recién creado no lo tenía hasta recargar — y
          // en DEMO nunca lo tiene, porque ahí no hay base. Como el corte y
          // "Ventas de hoy" ahora deciden por creadoEn (ver lib/turno.ts),
          // demo y producción se comportaban distinto y un pedido de demo
          // caía siempre en la rama de respaldo. Poniéndolo desde el
          // principio, los dos siguen exactamente el mismo camino.
          creadoEn: new Date().toISOString(),
          ...camposEmpleado(),
        };
        pedidoCreado = pedido;
        negocioId = prev.business.id;
        return { ...prev, fonda: { ...f, pedidos: [pedido, ...f.pedidos] } };
      },
      { ventaOffline: true }
    );
    if (typeof navigator !== "undefined" && !navigator.onLine && pedidoCreado) {
      encolarVentaPendiente({
        id: pedidoId,
        negocioId,
        tipo: "fonda_pedido",
        payload: pedidoCreado,
        ...camposEmpleado(),
      }).catch((err) => console.error("No se pudo encolar la venta pendiente:", err));
    }
    setVariantesSheet(null);
  }

  return (
    <>
      <PageHeader title={tituloHoy} subtitle="Pedidos y ventas de la fonda" />
      <div className="grid gap-4 p-4">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as FiltroDia)} tabs={FILTROS} />
        <StatTile label="Ventas" value={formatMoney(ventas)} />
        <StatTile label="Gastos" value={formatMoney(gastos)} />
        {/*
          Ventas y Gastos de "Hoy" son del TURNO EN CURSO, no del día
          completo. Cuando ya hubo un cierre hoy, los dos arrancan en cero y
          sin esta línea parece que la app "perdió" lo de la mañana. Solo se
          muestra si de verdad hubo un cierre antes (desdeCuandoCuenta devuelve
          "Desde que abrieron hoy" cuando no lo hubo, que no aporta nada).
        */}
        {filtro === "hoy" && huboCierreHoy(negocio, hoyEnSuZona) && (
          <p className="-mt-2 px-1 text-xs text-muted-foreground">
            {desdeCuandoCuenta(negocio, negocio.timezone, hoyEnSuZona)}. Lo del turno anterior se ve en el corte.
          </p>
        )}
        <VentasPorEmpleado datos={equipoHoy} titulo="Equipo hoy" />
        {filtro === "hoy" && activos.length > 0 && (
          <div>
            <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Venta rápida</p>
            {bloqueadoPorLimite && (
              <BloqueoPlan activo={false} compacto texto={`Llegaste al límite de ${maxPedidos} pedidos este mes de tu plan ${plan.label}`} />
            )}
            <div className={cn("mt-2 grid grid-cols-2 gap-2", bloqueadoPorLimite && "pointer-events-none opacity-50")}>
              {activos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onTapPlatillo(p)}
                  disabled={bloqueadoPorLimite}
                  className="rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 active:scale-[0.98]"
                >
                  <p className="text-sm font-semibold">{p.nombre}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{formatMoney(p.precio)}</p>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
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
                      {formatHora12(p.hora)} · {p.clienteNombre}
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
                    <div className="mt-1.5">
                      <EmpleadoBadge nombre={p.empleadoNombreCache} rol={p.empleadoRolCache} />
                    </div>
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
    </>
  );
}
