"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase, isSupabaseConfigured } from "./supabase";
import {
  fetchNegocioByOwner,
  fetchTenantData,
  persistTenant,
  syncTenantDiff,
  citaFromRow,
  fetchVentaConItems,
  fetchPedidoConItems,
  fetchCitasDeNegocio,
  businessFromRow,
  gastoFromRow,
  cajaFromRow,
  clienteFromRow,
  HorarioYaApartadoError,
} from "./data";
import { readDemoPreview, writeDemoPreview, clearDemoPreview, DEMO_PREVIEW_EVENT } from "./demoPreview";
import { leerCacheLocal, sincronizarCacheLocalEnSegundoPlano } from "./local-cache";
import { todayISO, formatHora12 } from "./mock";
import type { Appointment, Business, GrocerySale, FondaOrder, Expense, CajaEntry, BarberClient, TenantData } from "./types";

type Source = "supabase" | "demo" | null;

/**
 * useSession() se llama desde MUCHOS componentes a la vez (el shell, cada
 * página, cada widget del FAB) y cada llamada es un hook independiente —
 * sin este cache, cada uno dispara su PROPIO fetchNegocioByOwner +
 * fetchTenantData (7+ queries para barbería) al montar, todos casi
 * simultáneos. Si Supabase responde lento o falla justo una de esas
 * ráfagas (típico recién creada la cuenta, con la sesión de Google todavía
 * asentándose), esa instancia en particular se queda con session=null para
 * siempre — el shell (que montó primero y sí le pegó) se ve bien, pero esa
 * pantalla en particular nunca carga nada, aunque ready ya esté en true.
 * Este cache module-level (compartido por TODAS las instancias del hook en
 * la pestaña del navegador) hace que solo la PRIMERA instancia dispare el
 * fetch real; el resto lo reusa al instante o espera el mismo fetch en
 * vuelo en vez de duplicarlo.
 */
let cachedTenant: { userId: string; tenant: TenantData } | null = null;
const fetchesEnVuelo = new Map<string, Promise<TenantData | null>>();

function limpiarCacheTenant() {
  cachedTenant = null;
  fetchesEnVuelo.clear();
}

/**
 * update() (más abajo) dispara syncTenantDiff() en SEGUNDO PLANO — nadie
 * espera esa promesa, así que un gasto/venta/cita nuevo se ve al instante
 * en pantalla (optimista) mientras el INSERT real todavía viaja a
 * Supabase. Eso está bien mientras la pestaña siga viva, pero
 * TurnoControl/TopBar usan `window.location.href = ...` para volver a modo
 * DUEÑO (a propósito — descarta cualquier estado de React residual, ver
 * comentario de volverADuenoYRecargar) y una navegación dura CANCELA
 * cualquier fetch todavía en vuelo. Si el vendedor guarda algo y de
 * inmediato regresa a modo dueño, el INSERT nunca llegaba a terminar: se
 * veía guardado un instante y luego "no se guardó nada" para el dueño.
 * Este set + esperarSincronizacionPendiente() (exportada abajo) es lo que
 * deja que esas navegaciones esperen a que lo pendiente termine de verdad
 * antes de descartar la página.
 */
const escriturasPendientes = new Set<Promise<unknown>>();

/**
 * Se llama ANTES de cualquier `window.location.href = ...` que cambie de
 * identidad (volver a dueño, "salida de emergencia") — nunca antes de un
 * simple cambio de pantalla dentro de /app, donde React sigue vivo y no
 * hay nada que cancelar. Timeout corto: si algo se queda pegado (red muy
 * mala) no debe dejar al dueño atorado sin poder volver a su propio modo.
 */
export async function esperarSincronizacionPendiente(timeoutMs = 4000): Promise<void> {
  if (escriturasPendientes.size === 0) return;
  const todas = Promise.allSettled(Array.from(escriturasPendientes));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([todas, timeout]);
}

/**
 * /demo/[tipo] -> "Generar mi demo" navega a /app/inicio?preview=true. Sin
 * esto, un usuario YA logueado (o un admin) que genera un demo cae en
 * resolveForUser(userId) con userId real: eso ignora por completo el
 * fl_demo_preview que se acaba de escribir en localStorage y va derecho a
 * fetchNegocioByOwner(userId) — como esa cuenta real normalmente no tiene
 * un negocio del tipo recién armado, el resultado es session=null, y
 * AuthenticatedShell interpreta "logueado pero sin negocio" como "manda a
 * /onboarding", que a su vez ve el fl_demo_preview ahí sentado y muestra
 * directo la pantalla de "actívalo, 7 días gratis" — el demo nunca se
 * llega a ver. (Sin sesión real, esto nunca pasa: resolveForUser(null) ya
 * leía el preview directo, por eso en incógnito sí funcionaba.)
 *
 * El flag vive en sessionStorage (no la URL) para sobrevivir a la
 * navegación entre pantallas de /app/* una vez adentro — cada una monta su
 * propia instancia de useSession() y perdería el ?preview=true de la URL
 * en cuanto el usuario le diera clic a otro tab del BottomNav.
 */
const PREVIEW_FLAG = "fl_demo_preview_active";

function estaEnModoPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("preview") === "true") {
      window.sessionStorage.setItem(PREVIEW_FLAG, "1");
      return true;
    }
    return window.sessionStorage.getItem(PREVIEW_FLAG) === "1";
  } catch {
    return false;
  }
}

function limpiarModoPreview() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PREVIEW_FLAG);
  } catch {
    // sessionStorage no disponible (modo privado estricto, etc.): no hay nada que limpiar
  }
}

/**
 * update() (usado por el FAB/QuickAdd) actualiza de forma optimista la
 * sesión de la instancia de useSession() que lo llamó — normalmente la del
 * shell, porque el FAB recibe `session`/`update` de ahí, no de la página
 * que se esté viendo. Sin esto, agregar una cita o cobrar un servicio
 * desde el FAB se veía al instante en el shell (el banner de demo, etc.)
 * pero la página de Agenda o Caja — otra instancia de useSession(), con su
 * propio estado de React — se quedaba con los datos de como estaban al
 * montar, hasta navegar a otra pantalla y volver (eso sí dispara un
 * useEffect nuevo, que ahora sí lee el cache ya actualizado). Este evento
 * avisa a TODAS las instancias en la pestaña para que sincronicen su
 * estado local al cache compartido apenas cambia, sin esperar a un
 * remount ni depender de que el realtime de Supabase alcance a llegar.
 */
const TENANT_CACHE_EVENT = "fl_tenant_cache_change";

function actualizarCacheTenant(userId: string, tenant: TenantData) {
  cachedTenant = { userId, tenant };
  window.dispatchEvent(new CustomEvent(TENANT_CACHE_EVENT, { detail: { userId } }));
}

type EventoCita = { tipo: "insert" | "update"; cita: Appointment };

/**
 * Mismo problema de fondo que el cache de arriba, pero para el canal de
 * realtime de citas: cada instancia de useSession() llamaba su PROPIO
 * supabase.channel(`citas-${negocioId}`).on(...).on(...).subscribe(). Con
 * dos o más instancias resolviendo el mismo negocio (el shell + la página
 * actual, por ejemplo — ahora incluso más seguido gracias al cache de
 * arriba, que hace que resuelvan casi al mismo tiempo), la SEGUNDA
 * instancia intentaba agregar sus propios .on('postgres_changes', ...) a
 * un canal con el mismo topic que la primera YA había mandado a
 * subscribe() — supabase-js v2 truena ahí ("cannot add 'postgres_changes'
 * callbacks... after 'subscribe()'"), y ese throw tumbaba resolveForUser
 * COMPLETO (pasaba por el catch), dejando session en null para siempre:
 * el círculo infinito real detrás del bug de barbería.
 *
 * Fix: un solo canal compartido por negocio, con .on() antes de un único
 * .subscribe() — cada instancia de useSession() solo se registra como
 * oyente (onEvento) en vez de crear su propio canal; la última en
 * desmontarse es la que lo cierra.
 */
let citasChannel: ReturnType<typeof supabase.channel> | null = null;
let citasChannelNegocioId: string | null = null;
const citasListeners = new Set<(evento: EventoCita) => void>();

/**
 * Arma (o rearma) el canal de citas para `negocioId`. Separado de
 * suscribirseACitasEnVivo para poder llamarse solo desde el reintento de
 * abajo sin pasar por el chequeo de citasChannelNegocioId (que en ese punto
 * ya está en null a propósito) ni tocar citasListeners.
 *
 * El `.subscribe(status, err)` con callback es nuevo — antes se llamaba
 * `.subscribe()` a secas, así que un CHANNEL_ERROR/TIMED_OUT (token de
 * Realtime vencido, WebSocket caído, etc.) nunca se veía en consola: el
 * canal se quedaba "muerto" en silencio y el dueño nunca más recibía
 * eventos hasta refrescar. Con logging + hasta 3 reintentos (3s de
 * separación) esto se autorepara solo en la mayoría de los casos; si de
 * plano Realtime sigue sin entregar sin ni siquiera reportar error (mismo
 * síntoma reportado: "SUBSCRIBED" pero cero payloads, cero errores), el
 * polling de respaldo en escucharCitasEnVivo (lib/session.ts, useSession)
 * es la red de seguridad final.
 */
function armarCanalCitas(negocioId: string, intento = 0) {
  const nuevoCanal = supabase
    .channel(`citas-${negocioId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "barberia_citas", filter: `negocio_id=eq.${negocioId}` },
      (payload) => {
        console.log("[session] citas realtime: INSERT recibido", payload.new);
        const cita = citaFromRow(payload.new as Record<string, unknown>);
        // Un solo toast por evento real de Supabase, aquí y no dentro de
        // cada listener — con el shell y la pantalla actual (ej. Agenda)
        // cada uno con su propia instancia de useSession() suscrita al
        // mismo canal compartido, un toast por listener duplicaría el
        // aviso (2+ toasts para la misma cita nueva).
        toast.success(`Nueva cita: ${cita.clienteNombre} · ${formatHora12(cita.hora)}`);
        citasListeners.forEach((l) => l({ tipo: "insert", cita }));
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "barberia_citas", filter: `negocio_id=eq.${negocioId}` },
      (payload) => {
        console.log("[session] citas realtime: UPDATE recibido", payload.new);
        const cita = citaFromRow(payload.new as Record<string, unknown>);
        citasListeners.forEach((l) => l({ tipo: "update", cita }));
      }
    )
    .subscribe((status, err) => {
      console.log("[session] canal de citas:", status, err ?? "");
      if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
      // citasChannelNegocioId !== negocioId: ya se desmontó o cambió de
      // negocio mientras esperábamos — no reintentar un canal que ya nadie
      // quiere.
      if (citasChannelNegocioId !== negocioId || intento >= 3) {
        console.error(`[session] canal de citas falló y no se reintenta más (intento ${intento}):`, err);
        return;
      }
      console.error(`[session] canal de citas falló, reintentando en 3s (intento ${intento + 1}/3):`, err);
      supabase.removeChannel(nuevoCanal);
      citasChannel = null;
      citasChannelNegocioId = null;
      setTimeout(() => {
        if (citasListeners.size === 0) return;
        armarCanalCitas(negocioId, intento + 1);
      }, 3000);
    });
  citasChannel = nuevoCanal;
  citasChannelNegocioId = negocioId;
}

function suscribirseACitasEnVivo(negocioId: string, onEvento: (evento: EventoCita) => void): () => void {
  if (!negocioId) {
    console.error("[session] suscribirseACitasEnVivo: negocioId vacío/undefined, no se arma el canal.");
    return () => {};
  }
  if (citasChannelNegocioId !== negocioId) {
    if (citasChannel) supabase.removeChannel(citasChannel);
    // citasChannelNegocioId solo se marca DESPUÉS de armar el canal con
    // éxito — si .channel(...).on(...).on(...).subscribe() truena a la
    // mitad, un intento anterior fallido no debe dejar el módulo
    // pensando que ya hay un canal listo para este negocio (eso
    // envenenaría TODOS los intentos futuros: citasChannelNegocioId ya
    // "coincidiría" así que este if nunca se volvería a ejecutar, sin
    // canal real detrás).
    citasChannel = null;
    citasChannelNegocioId = null;
    armarCanalCitas(negocioId);
  }
  citasListeners.add(onEvento);
  return () => {
    citasListeners.delete(onEvento);
    if (citasListeners.size === 0 && citasChannel) {
      supabase.removeChannel(citasChannel);
      citasChannel = null;
      citasChannelNegocioId = null;
    }
  };
}

/**
 * Mismo patrón que suscribirseACitasEnVivo, para abarrotes_ventas: sin
 * esto, una venta nueva cobrada en ESTA pestaña (vía update(), optimista)
 * se ve al instante gracias a TENANT_CACHE_EVENT, pero una venta cobrada
 * desde OTRO dispositivo/caja de la misma tienda nunca llegaba a esta
 * sesión sin recargar. Un solo canal compartido por negocio — igual que
 * arriba, dos instancias de useSession() no pueden cada una llamar su
 * propio .channel(...).subscribe() con el mismo topic.
 *
 * El payload de INSERT solo trae la fila de abarrotes_ventas, sin sus
 * items (tabla abarrotes_sale_items aparte) — por eso el handler hace una
 * consulta extra (fetchVentaConItems) antes de avisar a los listeners, a
 * diferencia de citaFromRow que arma la cita completa solo con el payload.
 */
let ventasChannel: ReturnType<typeof supabase.channel> | null = null;
let ventasChannelNegocioId: string | null = null;
const ventasListeners = new Set<(venta: GrocerySale) => void>();

function suscribirseAVentasEnVivo(negocioId: string, onEvento: (venta: GrocerySale) => void): () => void {
  if (ventasChannelNegocioId !== negocioId) {
    if (ventasChannel) supabase.removeChannel(ventasChannel);
    ventasChannel = null;
    ventasChannelNegocioId = null;
    const nuevoCanal = supabase
      .channel(`abarrotes-ventas-${negocioId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "abarrotes_ventas", filter: `negocio_id=eq.${negocioId}` },
        (payload) => {
          const ventaId = (payload.new as Record<string, unknown>).id as string;
          fetchVentaConItems(ventaId)
            .then((venta) => {
              if (venta) ventasListeners.forEach((l) => l(venta));
            })
            .catch((err) => console.error("[session] no se pudo cargar la venta nueva del realtime:", err));
        }
      )
      .subscribe();
    ventasChannel = nuevoCanal;
    ventasChannelNegocioId = negocioId;
  }
  ventasListeners.add(onEvento);
  return () => {
    ventasListeners.delete(onEvento);
    if (ventasListeners.size === 0 && ventasChannel) {
      supabase.removeChannel(ventasChannel);
      ventasChannel = null;
      ventasChannelNegocioId = null;
    }
  };
}

/**
 * Mismo patrón que suscribirseAVentasEnVivo, para fonda_pedidos — antes esta
 * suscripción no existía (el único mecanismo era fetchPedidosPendientes en
 * fonda-dashboard.tsx, que solo trae pedidos con estado="pendiente" al
 * montar la pantalla), así que un pedido cobrado/entregado desde OTRO
 * dispositivo (ej. un vendedor con su propia sesión en otra tablet de la
 * misma fonda) nunca llegaba a este tab: ni aparecía en la lista, ni sumaba
 * en las gráficas de ingresos/pedidos que leen session.fonda.pedidos. Con
 * INSERT y UPDATE (a diferencia de ventas, que solo escucha INSERT: un
 * pedido sí cambia de estado después de creado — "pendiente" -> "entregado"
 * es justo el cambio que hay que reflejar para que cuente en ingresos).
 */
let pedidosChannel: ReturnType<typeof supabase.channel> | null = null;
let pedidosChannelNegocioId: string | null = null;
const pedidosListeners = new Set<(pedido: FondaOrder) => void>();

function suscribirseAPedidosEnVivo(negocioId: string, onEvento: (pedido: FondaOrder) => void): () => void {
  if (pedidosChannelNegocioId !== negocioId) {
    if (pedidosChannel) supabase.removeChannel(pedidosChannel);
    pedidosChannel = null;
    pedidosChannelNegocioId = null;
    // fonda_pedidos y fonda_pedido_items se insertan en dos llamadas
    // separadas (ver persistTenant/syncTenantDiff en lib/data.ts) — un
    // INSERT de fonda_pedidos puede llegar por realtime ANTES de que la
    // segunda llamada (los items) termine. Un solo reintento a los 400ms
    // (tiempo de sobra para esa segunda llamada) evita pisar un pedido ya
    // completo en el estado local con una versión momentáneamente sin
    // items — no aplica a UPDATE (los items ya existían desde el insert).
    const avisarCambio = (eventType: "INSERT" | "UPDATE") => (payload: { new: Record<string, unknown> }) => {
      const pedidoId = payload.new.id as string;
      fetchPedidoConItems(pedidoId)
        .then(async (pedido) => {
          if (pedido && eventType === "INSERT" && pedido.items.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, 400));
            pedido = await fetchPedidoConItems(pedidoId);
          }
          if (pedido) pedidosListeners.forEach((l) => l(pedido!));
        })
        .catch((err) => console.error("[session] no se pudo cargar el pedido nuevo/actualizado del realtime:", err));
    };
    const nuevoCanal = supabase
      .channel(`fonda-pedidos-${negocioId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fonda_pedidos", filter: `negocio_id=eq.${negocioId}` },
        avisarCambio("INSERT")
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fonda_pedidos", filter: `negocio_id=eq.${negocioId}` },
        avisarCambio("UPDATE")
      )
      .subscribe();
    pedidosChannel = nuevoCanal;
    pedidosChannelNegocioId = negocioId;
  }
  pedidosListeners.add(onEvento);
  return () => {
    pedidosListeners.delete(onEvento);
    if (pedidosListeners.size === 0 && pedidosChannel) {
      supabase.removeChannel(pedidosChannel);
      pedidosChannel = null;
      pedidosChannelNegocioId = null;
    }
  };
}

/**
 * Mismo patrón otra vez, para UPDATE en negocios — sobre todo para
 * negocios.plan: /admin lo cambia con service_role desde OTRA sesión (la
 * del admin, no la de este dueño), así que sin esto un upgrade/downgrade
 * de plan solo se reflejaba hasta que el dueño recargara la página. A
 * diferencia de ventas, aquí el payload del UPDATE ya trae la fila
 * completa — no hace falta ninguna consulta extra.
 */
let negocioChannel: ReturnType<typeof supabase.channel> | null = null;
let negocioChannelId: string | null = null;
const negocioListeners = new Set<(business: Business) => void>();

function suscribirseANegocioEnVivo(negocioId: string, onEvento: (business: Business) => void): () => void {
  if (negocioChannelId !== negocioId) {
    if (negocioChannel) supabase.removeChannel(negocioChannel);
    negocioChannel = null;
    negocioChannelId = null;
    const nuevoCanal = supabase
      .channel(`negocio-${negocioId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "negocios", filter: `id=eq.${negocioId}` },
        (payload) => {
          const business = businessFromRow(payload.new as Record<string, unknown>);
          negocioListeners.forEach((l) => l(business));
        }
      )
      .subscribe();
    negocioChannel = nuevoCanal;
    negocioChannelId = negocioId;
  }
  negocioListeners.add(onEvento);
  return () => {
    negocioListeners.delete(onEvento);
    if (negocioListeners.size === 0 && negocioChannel) {
      supabase.removeChannel(negocioChannel);
      negocioChannel = null;
      negocioChannelId = null;
    }
  };
}

/**
 * fonda_gastos/abarrotes_gastos/barberia_caja nunca tuvieron NINGÚN canal de
 * realtime (a diferencia de citas/ventas/pedidos/negocios, arriba) — un
 * gasto (o una entrada de caja) registrado desde OTRO dispositivo/pestaña
 * de la misma sesión (p. ej. el dueño viendo el dashboard en su celular
 * mientras alguien más registra un gasto en la tablet del negocio, o dos
 * pestañas del mismo dueño) nunca se veía sin recargar. No es un problema
 * de RLS entre dueño/empleado: el modo PIN de empleado (lib/empleados.ts)
 * nunca crea su propia sesión de Auth — auth.uid() sigue siendo el del
 * dueño sin importar quién esté "activo" en el dispositivo (ver
 * fonda_gastos_owner/abarrotes_gastos_owner, que usan is_negocio_owner()
 * igual que el resto) — así que el insert de un empleado ya llegaba bien a
 * Supabase; lo único que faltaba era avisarle a las demás pestañas/
 * dispositivos que había uno nuevo. Mismo patrón de canal compartido por
 * negocio que el resto de este archivo, un canal por tabla ya que
 * fonda_gastos/abarrotes_gastos/barberia_caja son tablas separadas con
 * forma distinta (Expense vs CajaEntry).
 */
let gastosChannel: ReturnType<typeof supabase.channel> | null = null;
let gastosChannelKey: string | null = null;
const gastosListeners = new Set<(evento: { tipo: "insert" | "update"; gasto: Expense }) => void>();

function suscribirseAGastosEnVivo(negocioId: string, tabla: "fonda_gastos" | "abarrotes_gastos", onEvento: (evento: { tipo: "insert" | "update"; gasto: Expense }) => void): () => void {
  const key = `${tabla}-${negocioId}`;
  if (gastosChannelKey !== key) {
    if (gastosChannel) supabase.removeChannel(gastosChannel);
    gastosChannel = null;
    gastosChannelKey = null;
    const nuevoCanal = supabase
      .channel(`gastos-${key}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: tabla, filter: `negocio_id=eq.${negocioId}` },
        (payload) => {
          const gasto = gastoFromRow(payload.new as Record<string, unknown>);
          gastosListeners.forEach((l) => l({ tipo: "insert", gasto }));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: tabla, filter: `negocio_id=eq.${negocioId}` },
        (payload) => {
          const gasto = gastoFromRow(payload.new as Record<string, unknown>);
          gastosListeners.forEach((l) => l({ tipo: "update", gasto }));
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.error(`[session] canal de ${tabla} falló:`, err);
      });
    gastosChannel = nuevoCanal;
    gastosChannelKey = key;
  }
  gastosListeners.add(onEvento);
  return () => {
    gastosListeners.delete(onEvento);
    if (gastosListeners.size === 0 && gastosChannel) {
      supabase.removeChannel(gastosChannel);
      gastosChannel = null;
      gastosChannelKey = null;
    }
  };
}

let cajaChannel: ReturnType<typeof supabase.channel> | null = null;
let cajaChannelNegocioId: string | null = null;
const cajaListeners = new Set<(evento: { tipo: "insert" | "update"; entry: CajaEntry }) => void>();

/** Mismo patrón que suscribirseAGastosEnVivo, para barberia_caja (propinas/gastos de barbería, forma CajaEntry en vez de Expense). */
function suscribirseACajaEnVivo(negocioId: string, onEvento: (evento: { tipo: "insert" | "update"; entry: CajaEntry }) => void): () => void {
  if (cajaChannelNegocioId !== negocioId) {
    if (cajaChannel) supabase.removeChannel(cajaChannel);
    cajaChannel = null;
    cajaChannelNegocioId = null;
    const nuevoCanal = supabase
      .channel(`barberia-caja-${negocioId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "barberia_caja", filter: `negocio_id=eq.${negocioId}` },
        (payload) => {
          const entry = cajaFromRow(payload.new as Record<string, unknown>);
          cajaListeners.forEach((l) => l({ tipo: "insert", entry }));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "barberia_caja", filter: `negocio_id=eq.${negocioId}` },
        (payload) => {
          const entry = cajaFromRow(payload.new as Record<string, unknown>);
          cajaListeners.forEach((l) => l({ tipo: "update", entry }));
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.error("[session] canal de barberia_caja falló:", err);
      });
    cajaChannel = nuevoCanal;
    cajaChannelNegocioId = negocioId;
  }
  cajaListeners.add(onEvento);
  return () => {
    cajaListeners.delete(onEvento);
    if (cajaListeners.size === 0 && cajaChannel) {
      supabase.removeChannel(cajaChannel);
      cajaChannel = null;
      cajaChannelNegocioId = null;
    }
  };
}

/**
 * barberia_clientes nunca tuvo canal de realtime — un cliente nuevo dado
 * de alta al agendar una cita (NuevaCitaForm, ver components/quick-add/
 * barberia-quick-add.tsx) se veía al instante en ESA misma pestaña
 * (optimista + TENANT_CACHE_EVENT), pero /app/clientes en OTRO
 * dispositivo/pestaña del mismo negocio (el dueño viendo su lista de
 * clientes mientras un vendedor agenda en la tablet del mostrador) no se
 * enteraba sin refrescar. Mismo patrón que el resto de este archivo.
 * INSERT y UPDATE (editar nombre/notas/cumpleaños desde /app/clientes en
 * otro dispositivo también debe reflejarse).
 */
let clientesChannel: ReturnType<typeof supabase.channel> | null = null;
let clientesChannelNegocioId: string | null = null;
const clientesListeners = new Set<(evento: { tipo: "insert" | "update"; cliente: BarberClient }) => void>();

function suscribirseAClientesEnVivo(negocioId: string, onEvento: (evento: { tipo: "insert" | "update"; cliente: BarberClient }) => void): () => void {
  if (clientesChannelNegocioId !== negocioId) {
    if (clientesChannel) supabase.removeChannel(clientesChannel);
    clientesChannel = null;
    clientesChannelNegocioId = null;
    const nuevoCanal = supabase
      .channel(`barberia-clientes-${negocioId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "barberia_clientes", filter: `negocio_id=eq.${negocioId}` },
        (payload) => {
          const cliente = clienteFromRow(payload.new as Record<string, unknown>);
          clientesListeners.forEach((l) => l({ tipo: "insert", cliente }));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "barberia_clientes", filter: `negocio_id=eq.${negocioId}` },
        (payload) => {
          const cliente = clienteFromRow(payload.new as Record<string, unknown>);
          clientesListeners.forEach((l) => l({ tipo: "update", cliente }));
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.error("[session] canal de barberia_clientes falló:", err);
      });
    clientesChannel = nuevoCanal;
    clientesChannelNegocioId = negocioId;
  }
  clientesListeners.add(onEvento);
  return () => {
    clientesListeners.delete(onEvento);
    if (clientesListeners.size === 0 && clientesChannel) {
      supabase.removeChannel(clientesChannel);
      clientesChannel = null;
      clientesChannelNegocioId = null;
    }
  };
}

/**
 * Canal de CATÁLOGO: precios, servicios, platillos, stock y empleados.
 *
 * Todo lo transaccional (citas, ventas, pedidos, caja, gastos, clientes) ya
 * tenía su canal arriba; el catálogo no tenía ninguno, y eso se sentía como
 * "la app se quedó pegada, hay que refrescar":
 *
 * - El dueño sube el precio de un servicio desde su celular y la tablet del
 *   mostrador sigue cobrando el precio viejo el resto del día.
 * - La fonda marca un platillo como agotado y la otra pantalla lo sigue
 *   ofreciendo, así que se siguen levantando pedidos de algo que ya no hay.
 * - El dueño da de alta a un empleado nuevo y el kiosko no lo ofrece hasta
 *   que alguien recarga.
 * - Dos cajas de abarrotes venden el mismo producto y cada una descuenta
 *   stock sobre el número que tenía en memoria al abrir.
 *
 * A diferencia de los canales de arriba, este NO arma la fila desde el
 * payload: vuelve a pedir el catálogo completo (con debounce) y reemplaza
 * solo esas listas. Es a propósito — el catálogo cambia poco y en ráfagas
 * (guardar el menú del día toca 20 platillos de un jalón), así que un
 * re-fetch amortiguado sale más barato y más simple que 4 merges por fila,
 * y no hay riesgo de reconstruir mal una fila con variantes/lotes anidados.
 *
 * Las listas transaccionales NO se tocan aquí, aunque el fetch las traiga:
 * tienen su propio realtime y su propio estado optimista, y pisarlas desde
 * aquí borraría una venta que se acaba de cobrar y todavía no sube.
 */
/**
 * negocio_empleados NO está en esta lista a propósito, aunque "el empleado
 * nuevo no aparece sin recargar" sería la misma clase de molestia que el
 * resto: esa tabla guarda `pin_hash` (ver el esquema), y meterla en la
 * publication de realtime significa mandar el hash del PIN de cada empleado
 * por el WebSocket en cada INSERT/UPDATE. Un PIN de 4 dígitos son 10 mil
 * combinaciones: un hash filtrado se rompe al instante. El roster de
 * empleados cambia una vez cada varias semanas y ya se refresca al entrar
 * al kiosko — no vale ese precio.
 */
const TABLAS_CATALOGO = [
  "barberia_servicios",
  "barberia_productos",
  "abarrotes_productos",
  "fonda_platillos",
] as const;

let catalogoChannel: ReturnType<typeof supabase.channel> | null = null;
let catalogoChannelNegocioId: string | null = null;
const catalogoListeners = new Set<() => void>();

function suscribirseACatalogoEnVivo(negocioId: string, onCambio: () => void): () => void {
  if (!negocioId) return () => {};
  if (catalogoChannelNegocioId !== negocioId) {
    if (catalogoChannel) supabase.removeChannel(catalogoChannel);
    catalogoChannel = null;
    catalogoChannelNegocioId = null;

    let canal = supabase.channel(`catalogo-${negocioId}`);
    for (const tabla of TABLAS_CATALOGO) {
      // "*" cubre INSERT/UPDATE/DELETE: un platillo BORRADO tiene que
      // desaparecer de la otra pantalla igual que uno nuevo tiene que
      // aparecer. Como esto solo dispara un re-fetch, no hace falta
      // distinguir el evento.
      canal = canal.on("postgres_changes", { event: "*", schema: "public", table: tabla, filter: `negocio_id=eq.${negocioId}` }, () => {
        catalogoListeners.forEach((l) => l());
      });
    }
    canal.subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.error("[session] canal de catálogo falló:", err);
    });

    catalogoChannel = canal;
    catalogoChannelNegocioId = negocioId;
  }
  catalogoListeners.add(onCambio);
  return () => {
    catalogoListeners.delete(onCambio);
    if (catalogoListeners.size === 0 && catalogoChannel) {
      supabase.removeChannel(catalogoChannel);
      catalogoChannel = null;
      catalogoChannelNegocioId = null;
    }
  };
}

/**
 * Sesión del negocio activo. Dos fuentes posibles:
 *
 * - "supabase": el usuario está logueado y ya tiene un negocio real en la
 *   base de datos. update() aplica el cambio localmente (optimista) y
 *   sincroniza el diff con Supabase en segundo plano.
 * - "demo": todavía no hay sesión (viene de /demo/[tipo] sin haber iniciado
 *   sesión). Vive solo en localStorage hasta que se "activa" con claim().
 */
export function useSession() {
  const [session, setSessionState] = useState<TenantData | null>(null);
  const [ready, setReady] = useState(false);
  const sourceRef = useRef<Source>(null);
  const sessionRef = useRef<TenantData | null>(null);
  const citasUnsubRef = useRef<(() => void) | null>(null);
  const citasPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ventasUnsubRef = useRef<(() => void) | null>(null);
  const pedidosUnsubRef = useRef<(() => void) | null>(null);
  const negocioUnsubRef = useRef<(() => void) | null>(null);
  const gastosUnsubRef = useRef<(() => void) | null>(null);
  const cajaUnsubRef = useRef<(() => void) | null>(null);
  const clientesUnsubRef = useRef<(() => void) | null>(null);
  const catalogoUnsubRef = useRef<(() => void) | null>(null);
  const catalogoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  sessionRef.current = session;

  const loadFromDemoPreview = useCallback(() => {
    const demo = readDemoPreview();
    sourceRef.current = demo ? "demo" : null;
    setSessionState(demo);
  }, []);

  useEffect(() => {
    let cancelled = false;

    function detenerCitasEnVivo() {
      citasUnsubRef.current?.();
      citasUnsubRef.current = null;
      if (citasPollRef.current) {
        clearInterval(citasPollRef.current);
        citasPollRef.current = null;
      }
    }

    function detenerVentasEnVivo() {
      ventasUnsubRef.current?.();
      ventasUnsubRef.current = null;
    }

    function detenerPedidosEnVivo() {
      pedidosUnsubRef.current?.();
      pedidosUnsubRef.current = null;
    }

    function detenerNegocioEnVivo() {
      negocioUnsubRef.current?.();
      negocioUnsubRef.current = null;
    }

    function detenerGastosEnVivo() {
      gastosUnsubRef.current?.();
      gastosUnsubRef.current = null;
    }

    function detenerCajaEnVivo() {
      cajaUnsubRef.current?.();
      cajaUnsubRef.current = null;
    }

    function detenerClientesEnVivo() {
      clientesUnsubRef.current?.();
      clientesUnsubRef.current = null;
    }

    function detenerCatalogoEnVivo() {
      catalogoUnsubRef.current?.();
      catalogoUnsubRef.current = null;
      if (catalogoTimerRef.current) {
        clearTimeout(catalogoTimerRef.current);
        catalogoTimerRef.current = null;
      }
    }

    /**
     * Precios, servicios, platillos, stock y empleados en vivo — ver
     * suscribirseACatalogoEnVivo arriba para el porqué del re-fetch en vez
     * del merge por fila.
     */
    function escucharCatalogoEnVivo(negocioId: string, userId: string) {
      detenerCatalogoEnVivo();
      catalogoUnsubRef.current = suscribirseACatalogoEnVivo(negocioId, () => {
        // Debounce: guardar el menú del día dispara un evento por platillo.
        // Sin esto serían 20 re-fetches seguidos por una sola acción.
        if (catalogoTimerRef.current) clearTimeout(catalogoTimerRef.current);
        catalogoTimerRef.current = setTimeout(() => {
          fetchTenantFresco(userId)
            .then((fresco) => {
              if (cancelled || !fresco) return;
              setSessionState((prev) => {
                if (!prev) return prev;
                // Llegó un evento de OTRO negocio (se cambió de cuenta
                // mientras el fetch estaba en vuelo) — descartar.
                if (prev.business.id !== fresco.business.id) return prev;
                // SOLO las listas de catálogo. citas/ventas/pedidos/caja/
                // gastos/clientes se quedan como están: tienen su propio
                // realtime y su propio estado optimista, y pisarlas aquí
                // borraría una venta recién cobrada que todavía no sube.
                return {
                  ...prev,
                  barberia: prev.barberia
                    ? { ...prev.barberia, servicios: fresco.barberia?.servicios ?? prev.barberia.servicios, productos: fresco.barberia?.productos ?? prev.barberia.productos }
                    : prev.barberia,
                  abarrotes: prev.abarrotes ? { ...prev.abarrotes, productos: fresco.abarrotes?.productos ?? prev.abarrotes.productos } : prev.abarrotes,
                  fonda: prev.fonda ? { ...prev.fonda, platillos: fresco.fonda?.platillos ?? prev.fonda.platillos } : prev.fonda,
                };
              });
            })
            .catch((err) => console.error("[session] no se pudo refrescar el catálogo en vivo:", err));
        }, 800);
      });
    }

    /**
     * Nuevas citas agendadas desde /b/[slug] (un visitante sin sesión, en otra
     * pestaña/dispositivo) deben aparecer en el panel del barbero (Agenda, el
     * "Hoy" del dashboard) sin que tenga que recargar — de ahí esta
     * suscripción en tiempo real, en vez de solo el fetch inicial de arriba.
     * También escucha UPDATE: si el dueño cambia el estado de una cita (Listo,
     * Cancelar, Mover) desde otra pestaña/dispositivo suyo, esta sesión debe
     * verlo también, no solo los inserts nuevos. Se registra en el canal
     * COMPARTIDO (suscribirseACitasEnVivo, arriba) en vez de crear uno propio
     * — varias instancias de useSession() para el mismo negocio no pueden
     * cada una llamar su propio .channel(...).subscribe() con el mismo
     * topic, eso es justo lo que rompía la sesión completa.
     */
    function escucharCitasEnVivo(negocioId: string) {
      detenerCitasEnVivo();
      citasUnsubRef.current = suscribirseACitasEnVivo(negocioId, ({ tipo, cita }) => {
        setSessionState((prev) => {
          if (!prev?.barberia) return prev;
          if (tipo === "insert") {
            if (prev.barberia.citas.some((c) => c.id === cita.id)) return prev;
            return { ...prev, barberia: { ...prev.barberia, citas: [cita, ...prev.barberia.citas] } };
          }
          return {
            ...prev,
            barberia: { ...prev.barberia, citas: prev.barberia.citas.map((c) => (c.id === cita.id ? cita : c)) },
          };
        });
      });
      // Red de seguridad además del canal de arriba: si Realtime se queda
      // "SUBSCRIBED" pero deja de entregar postgres_changes sin ningún error
      // (el síntoma reportado — token de Realtime desincronizado tras
      // refrescar RLS a mano, WebSocket zombie, etc.), esto vuelve a traer
      // las citas del negocio cada 25s y mete las que falten — mismo
      // chequeo anti-eco por id que el realtime de arriba, así que no
      // duplica nada si el canal SÍ está entregando. No sustituye arreglar
      // el canal (por eso el logging nuevo en armarCanalCitas), pero
      // garantiza que "esperar un rato" alcance sin necesidad de F5.
      citasPollRef.current = setInterval(() => {
        fetchCitasDeNegocio(negocioId)
          .then((citasFrescas) => {
            setSessionState((prev) => {
              if (!prev?.barberia) return prev;
              const porId = new Map(citasFrescas.map((c) => [c.id, c] as const));
              // JSON.stringify en vez de === porque fetchCitasDeNegocio
              // siempre devuelve objetos nuevos (aunque el contenido no haya
              // cambiado) — sin esta comparación por contenido, `cambio`
              // sería true cada 25s aunque nada haya cambiado de verdad, y
              // el árbol completo del dashboard se re-renderizaría sin
              // necesidad en cada tick del polling.
              let cambio = false;
              const actualizadas = prev.barberia.citas.map((c) => {
                const fresca = porId.get(c.id);
                if (!fresca || JSON.stringify(fresca) === JSON.stringify(c)) return c;
                cambio = true;
                return fresca;
              });
              const nuevas = citasFrescas.filter((c) => !prev.barberia!.citas.some((existing) => existing.id === c.id));
              if (!cambio && nuevas.length === 0) return prev;
              return { ...prev, barberia: { ...prev.barberia, citas: [...nuevas, ...actualizadas] } };
            });
          })
          .catch((err) => console.error("[session] polling de respaldo de citas falló:", err));
      }, 25000);
    }

    /** Ver comentario de suscribirseAVentasEnVivo arriba. */
    function escucharVentasEnVivo(negocioId: string) {
      detenerVentasEnVivo();
      ventasUnsubRef.current = suscribirseAVentasEnVivo(negocioId, (venta) => {
        setSessionState((prev) => {
          if (!prev?.abarrotes) return prev;
          // Esta misma pestaña, si fue la que cobró la venta, ya la agregó
          // al instante vía update() — el eco del realtime llega después;
          // sin este chequeo saldría duplicada en la lista.
          if (prev.abarrotes.ventas.some((v) => v.id === venta.id)) return prev;
          return { ...prev, abarrotes: { ...prev.abarrotes, ventas: [venta, ...prev.abarrotes.ventas] } };
        });
      });
    }

    /** Ver comentario de suscribirseAPedidosEnVivo arriba. INSERT agrega (con el mismo chequeo anti-eco de ventas); UPDATE reemplaza el pedido existente por su versión fresca — así "entregado" desde otro dispositivo también se refleja aquí. */
    function escucharPedidosEnVivo(negocioId: string) {
      detenerPedidosEnVivo();
      pedidosUnsubRef.current = suscribirseAPedidosEnVivo(negocioId, (pedido) => {
        setSessionState((prev) => {
          if (!prev?.fonda) return prev;
          const existe = prev.fonda.pedidos.some((p) => p.id === pedido.id);
          const pedidos = existe
            ? prev.fonda.pedidos.map((p) => (p.id === pedido.id ? pedido : p))
            : [pedido, ...prev.fonda.pedidos];
          return { ...prev, fonda: { ...prev.fonda, pedidos } };
        });
      });
    }

    /** Ver comentario de suscribirseANegocioEnVivo arriba — aplica a los 3 verticales, no solo a uno. */
    function escucharNegocioEnVivo(negocioId: string) {
      detenerNegocioEnVivo();
      negocioUnsubRef.current = suscribirseANegocioEnVivo(negocioId, (business) => {
        setSessionState((prev) => (prev ? { ...prev, business } : prev));
      });
    }

    /** Ver comentario de suscribirseAGastosEnVivo arriba — mismo chequeo anti-eco por id que ventas/pedidos, INSERT agrega y UPDATE reemplaza (un gasto editado desde otro dispositivo también se refleja). */
    function escucharGastosEnVivo(negocioId: string, tabla: "fonda_gastos" | "abarrotes_gastos") {
      detenerGastosEnVivo();
      gastosUnsubRef.current = suscribirseAGastosEnVivo(negocioId, tabla, ({ tipo, gasto }) => {
        setSessionState((prev) => {
          const modulo = tabla === "fonda_gastos" ? prev?.fonda : prev?.abarrotes;
          if (!modulo) return prev;
          if (tipo === "insert") {
            if (modulo.gastos.some((g) => g.id === gasto.id)) return prev;
            const gastos = [gasto, ...modulo.gastos];
            return tabla === "fonda_gastos"
              ? { ...prev!, fonda: { ...prev!.fonda!, gastos } }
              : { ...prev!, abarrotes: { ...prev!.abarrotes!, gastos } };
          }
          const gastos = modulo.gastos.map((g) => (g.id === gasto.id ? gasto : g));
          return tabla === "fonda_gastos"
            ? { ...prev!, fonda: { ...prev!.fonda!, gastos } }
            : { ...prev!, abarrotes: { ...prev!.abarrotes!, gastos } };
        });
      });
    }

    /** Ver comentario de suscribirseACajaEnVivo arriba. */
    function escucharCajaEnVivo(negocioId: string) {
      detenerCajaEnVivo();
      cajaUnsubRef.current = suscribirseACajaEnVivo(negocioId, ({ tipo, entry }) => {
        setSessionState((prev) => {
          if (!prev?.barberia) return prev;
          if (tipo === "insert") {
            if (prev.barberia.caja.some((e) => e.id === entry.id)) return prev;
            return { ...prev, barberia: { ...prev.barberia, caja: [entry, ...prev.barberia.caja] } };
          }
          return { ...prev, barberia: { ...prev.barberia, caja: prev.barberia.caja.map((e) => (e.id === entry.id ? entry : e)) } };
        });
      });
    }

    /** Ver comentario de suscribirseAClientesEnVivo arriba. */
    function escucharClientesEnVivo(negocioId: string) {
      detenerClientesEnVivo();
      clientesUnsubRef.current = suscribirseAClientesEnVivo(negocioId, ({ tipo, cliente }) => {
        setSessionState((prev) => {
          if (!prev?.barberia) return prev;
          if (tipo === "insert") {
            if (prev.barberia.clientes.some((c) => c.id === cliente.id)) return prev;
            return { ...prev, barberia: { ...prev.barberia, clientes: [cliente, ...prev.barberia.clientes] } };
          }
          return {
            ...prev,
            barberia: { ...prev.barberia, clientes: prev.barberia.clientes.map((c) => (c.id === cliente.id ? cliente : c)) },
          };
        });
      });
    }

    /** El fetch real (negocio + todo su contenido) — se comparte vía fetchesEnVuelo entre instancias que montan casi al mismo tiempo. */
    async function fetchTenantFresco(userId: string): Promise<TenantData | null> {
      console.log("[session] paso 1: buscando negocio para userId", userId);
      const business = await fetchNegocioByOwner(userId);
      if (!business) {
        console.log("[session] paso 2: no se encontró negocio para userId", userId);
        return null;
      }
      console.log("[session] paso 2: negocio encontrado", { negocioId: business.id, tipo: business.tipo, ownerId: business.ownerId });
      const tenant = await fetchTenantData(business);
      console.log("[session] paso 3: datos del negocio cargados", {
        negocioId: business.id,
        tipo: business.tipo,
        servicios: tenant.barberia?.servicios.length,
        productos: tenant.barberia?.productos.length ?? tenant.abarrotes?.productos.length,
        platillos: tenant.fonda?.platillos.length,
      });
      return tenant;
    }

    // TEMPORAL — quitar estos console.log en cuanto se diagnostique el bug
    // del círculo infinito en cuentas nuevas de barbería. Sin timeout, un
    // fetch que se cuelga (no truena, solo nunca resuelve) deja ready=false
    // para siempre y el spinner de "cargando" nunca se distingue de un
    // cuelgue real — con el timeout, a los 15s se trata como error (mismo
    // camino que un throw normal) en vez de spinner infinito silencioso.
    function conTimeout<T>(promise: Promise<T>, ms: number, etiqueta: string): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`[session] timeout de ${ms}ms esperando: ${etiqueta}`)), ms);
        promise.then(
          (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          }
        );
      });
    }

    /**
     * Reintenta fetchTenantFresco hasta 2 veces antes de rendirse. Un hard
     * refresh (Ctrl+Shift+R) dispara TODO al mismo tiempo — bundle completo
     * sin caché de por medio, el cliente de Supabase reasentando el token de
     * sesión, y las 7+ queries de fetchTenantData — así que es mucho más
     * fácil que UNA de esas queries truene a medias justo ahí que en una
     * navegación normal entre pantallas. Antes, ese único fallo tumbaba todo
     * el intento (ver el catch de resolveForUser) y, como leerCacheLocal ya
     * había pintado el catálogo local con pedidos/ventas/citas VACÍOS
     * (ver el comentario de leerCacheLocal en lib/local-cache.ts — esa tabla
     * nunca vive en el caché local, se reconstruye vacía a propósito), la
     * sesión se quedaba mostrando ese catálogo vacío como si fuera el
     * definitivo, para siempre — de ahí el "Ventas: $0" que nunca se
     * recupera aunque el negocio sí tenga pedidos hoy.
     */
    async function fetchTenantConReintentos(userId: string): Promise<TenantData | null> {
      const maxIntentos = 2;
      for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
          return await conTimeout(fetchTenantFresco(userId), 10000, `fetchTenantFresco(${userId}) intento ${intento}`);
        } catch (err) {
          if (intento === maxIntentos) throw err;
          console.error(`[session] intento ${intento}/${maxIntentos} de fetchTenantFresco falló, reintentando:`, err);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
      throw new Error("fetchTenantConReintentos: no debería llegar aquí");
    }

    async function resolveForUser(userId: string | null) {
      if (!userId) {
        loadFromDemoPreview();
        if (!cancelled) setReady(true);
        return;
      }

      // Bypass de preview: ver comentario de estaEnModoPreview() arriba.
      // Nunca toca cachedTenant/fetchesEnVuelo (esos son el negocio REAL de
      // este userId) ni dispara fetchNegocioByOwner — así el negocio real
      // de esta cuenta (si tiene uno) queda intacto para cuando salga del
      // preview con un login/reload limpio.
      if (estaEnModoPreview()) {
        const demo = readDemoPreview();
        if (demo) {
          sourceRef.current = "demo";
          setSessionState(demo);
          if (!cancelled) setReady(true);
          return;
        }
        // ?preview=true sin datos de demo que mostrar (se limpiaron o
        // nunca existieron): no tiene caso seguir en "modo preview" fantasma.
        limpiarModoPreview();
      }

      console.log("[session] resolveForUser arrancó para", userId);

      // Local-first (Parte 2 de PWA, ver lib/local-cache.ts): si hay un
      // catálogo cacheado de una sesión anterior de ESTE userId, lo pinta de
      // inmediato sin esperar la red — más rápido con buena señal, y lo
      // único que hay sin señal. No se espera (fire-and-forget): el fetch
      // real de abajo sigue su curso normal y, si gana la carrera (llega
      // primero, típico con buena señal), huboExito ya está en true y este
      // pintado se descarta solo. Si el fetch real falla (offline), este
      // caché es lo que evita caer a la demo/onboarding con datos reales
      // guardados en el dispositivo.
      let huboExito = false;
      let pintadoDesdeCache = false;
      if (cachedTenant?.userId !== userId) {
        leerCacheLocal(userId)
          .then((cache) => {
            if (cancelled || huboExito || !cache) return;
            pintadoDesdeCache = true;
            sourceRef.current = "supabase";
            setSessionState(cache.tenant);
            setReady(true);
          })
          .catch((err) => console.error("[session] no se pudo pintar desde el catálogo local:", err));
      }

      try {
        let tenant: TenantData | null;
        if (cachedTenant?.userId === userId) {
          // Otra instancia de useSession() (el shell, otra pestaña de esta
          // misma pantalla) ya resolvió a este mismo usuario — se reusa al
          // instante en vez de disparar 7+ queries de nuevo.
          console.log("[session] reusando cache para", userId);
          tenant = cachedTenant.tenant;
        } else {
          let fetch = fetchesEnVuelo.get(userId);
          if (!fetch) {
            fetch = fetchTenantConReintentos(userId);
            fetchesEnVuelo.set(userId, fetch);
            fetch.finally(() => fetchesEnVuelo.delete(userId));
          } else {
            console.log("[session] esperando fetch ya en vuelo para", userId);
          }
          tenant = await fetch;
        }
        if (cancelled) return;
        if (tenant) {
          console.log("[session] paso 4: sesión lista, negocio_id =", tenant.business.id);
          // A partir de aquí la sesión YA está resuelta con datos reales —
          // nada de lo que pase después (en particular, armar la
          // suscripción de realtime) debe poder tirar session de vuelta a
          // null. Antes escucharCitasEnVivo() vivía DENTRO de este mismo
          // try/catch: si tronaba (el bug de "cannot add postgres_changes
          // callbacks... after subscribe()", o cualquier otro problema de
          // realtime), el catch de abajo lo trataba igual que un fallo real
          // de carga de datos y mandaba todo a loadFromDemoPreview() — la
          // sesión que YA se había cargado bien se pisaba con null. Un
          // fallo de "citas en vivo" (una mejora, no algo indispensable
          // para ver el panel) nunca debe poder tumbar la sesión completa.
          sourceRef.current = "supabase";
          setSessionState(tenant);
          cachedTenant = { userId, tenant };
          huboExito = true;
          // Refresca el catálogo local (productos/precios, clientes,
          // empleados) en segundo plano — nunca bloquea lo de arriba.
          sincronizarCacheLocalEnSegundoPlano(userId, tenant);
          // Catálogo en vivo: aplica a los 3 giros (precios/servicios/
          // platillos/stock/empleados), por eso va antes del switch por tipo.
          try {
            escucharCatalogoEnVivo(tenant.business.id, userId);
          } catch (err) {
            console.error("[session] no se pudo suscribir al catálogo en vivo (la sesión sigue cargada bien):", err);
          }
          if (tenant.business.tipo === "barberia") {
            try {
              escucharCitasEnVivo(tenant.business.id);
            } catch (err) {
              console.error("[session] no se pudo suscribir a citas en vivo (la sesión sigue cargada bien):", err);
            }
            try {
              escucharCajaEnVivo(tenant.business.id);
            } catch (err) {
              console.error("[session] no se pudo suscribir a caja en vivo (la sesión sigue cargada bien):", err);
            }
            try {
              escucharClientesEnVivo(tenant.business.id);
            } catch (err) {
              console.error("[session] no se pudo suscribir a clientes en vivo (la sesión sigue cargada bien):", err);
            }
          } else if (tenant.business.tipo === "abarrotes") {
            try {
              escucharVentasEnVivo(tenant.business.id);
            } catch (err) {
              console.error("[session] no se pudo suscribir a ventas en vivo (la sesión sigue cargada bien):", err);
            }
            try {
              escucharGastosEnVivo(tenant.business.id, "abarrotes_gastos");
            } catch (err) {
              console.error("[session] no se pudo suscribir a gastos en vivo (la sesión sigue cargada bien):", err);
            }
          } else if (tenant.business.tipo === "fonda") {
            try {
              escucharPedidosEnVivo(tenant.business.id);
            } catch (err) {
              console.error("[session] no se pudo suscribir a pedidos en vivo (la sesión sigue cargada bien):", err);
            }
            try {
              escucharGastosEnVivo(tenant.business.id, "fonda_gastos");
            } catch (err) {
              console.error("[session] no se pudo suscribir a gastos en vivo (la sesión sigue cargada bien):", err);
            }
          }
          // Aplica a los 3 verticales — un cambio de plan desde /admin debe
          // reflejarse sin recargar sin importar el tipo de negocio.
          try {
            escucharNegocioEnVivo(tenant.business.id);
          } catch (err) {
            console.error("[session] no se pudo suscribir a cambios del negocio en vivo (la sesión sigue cargada bien):", err);
          }
        } else {
          // Logueado pero sin negocio todavía: se deja session en null y es
          // /onboarding quien lo crea de forma EXPLÍCITA (un solo botón, un
          // solo persistTenant) en cuanto el usuario confirma. Antes esto
          // también intentaba crear el negocio aquí en automático apenas
          // llegaba el evento de login — pero /onboarding hace su propio
          // fetchNegocioByOwner en paralelo sin esperar a este hook, así que
          // los dos podían intentar crear el negocio a la vez (o el usuario
          // terminaba el wizard mientras esta creación en segundo plano
          // todavía no acababa), dejando dos negocios para el mismo dueño o
          // tirando un error confuso en pleno "Crear mi sistema". Un solo
          // punto de creación es más simple y no tiene esa carrera.
          sourceRef.current = null;
          setSessionState(null);
          huboExito = true;
        }
      } catch (err) {
        console.error("[session] ERROR — no se pudo cargar el negocio desde Supabase:", err);
        // Si el catálogo local ya pintó datos reales (offline, ver arriba),
        // no los pisamos con la demo/null — el usuario se queda viendo su
        // negocio real, aunque desactualizado, en vez de rebotar a demo.
        if (!pintadoDesdeCache) {
          loadFromDemoPreview();
        } else {
          // El catálogo local NUNCA trae pedidos/ventas/citas/fiados (se
          // reconstruyen vacíos a propósito, ver lib/local-cache.ts) — sin
          // este aviso, el dueño ve "Ventas: $0" y no tiene forma de saber
          // que es un dato desactualizado y no que de verdad no vendió nada.
          toast.error("No se pudo actualizar tus pedidos/ventas de hoy. Recarga la página para reintentar.");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    // Distintas instancias de useSession() (p.ej. el shell que dueño del FAB
    // vs. la página de lista actual) tienen cada una su propio useState —
    // este listener es lo que las mantiene en sync cuando update() escribe
    // en demoPreview desde OTRA instancia. Se registra siempre, incluso sin
    // Supabase configurado, porque si no la sincronización entre pantallas
    // en modo demo se rompe silenciosamente.
    const onDemoChange = () => {
      if (sourceRef.current !== "supabase") loadFromDemoPreview();
    };
    window.addEventListener(DEMO_PREVIEW_EVENT, onDemoChange);
    window.addEventListener("storage", onDemoChange);

    // Equivalente a onDemoChange pero para negocios reales: otra instancia
    // de useSession() (típicamente el shell, dueño del FAB) acaba de
    // guardar un cambio optimista — se refleja aquí al instante, sin
    // esperar a que esta pantalla se desmonte y vuelva a montar. Ver
    // TENANT_CACHE_EVENT arriba.
    const onTenantCacheChange = () => {
      if (sourceRef.current === "supabase" && cachedTenant) setSessionState(cachedTenant.tenant);
    };
    window.addEventListener(TENANT_CACHE_EVENT, onTenantCacheChange);

    if (!isSupabaseConfigured) {
      loadFromDemoPreview();
      setReady(true);
      return () => {
        cancelled = true;
        window.removeEventListener(DEMO_PREVIEW_EVENT, onDemoChange);
        window.removeEventListener("storage", onDemoChange);
        window.removeEventListener(TENANT_CACHE_EVENT, onTenantCacheChange);
      };
    }

    // onAuthStateChange dispara "INITIAL_SESSION" en cuanto el cliente
    // termina de leer la sesión guardada en cookies — más confiable que un
    // getSession() suelto justo al montar, que en algunos casos alcanzaba a
    // resolver antes de que el cliente terminara de hidratarse y devolvía
    // null aunque las cookies de sesión ya estuvieran puestas (el "hay que
    // darle dos veces a Continuar con Google").
    let resolvedOnce = false;
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (event === "SIGNED_OUT") {
        resolvedOnce = true;
        sourceRef.current = null;
        setSessionState(null);
        setReady(true);
        detenerCitasEnVivo();
        detenerVentasEnVivo();
        detenerPedidosEnVivo();
        detenerNegocioEnVivo();
        detenerGastosEnVivo();
        detenerCajaEnVivo();
        detenerClientesEnVivo();
        detenerCatalogoEnVivo();
        limpiarCacheTenant();
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        resolvedOnce = true;
        resolveForUser(authSession?.user?.id ?? null);
      }
    });

    // Red de seguridad: si el evento inicial nunca llega, no te quedes
    // cargando para siempre.
    const fallbackTimer = setTimeout(() => {
      if (resolvedOnce || cancelled) return;
      supabase.auth.getSession().then(({ data }) => resolveForUser(data.session?.user?.id ?? null));
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      window.removeEventListener(DEMO_PREVIEW_EVENT, onDemoChange);
      window.removeEventListener("storage", onDemoChange);
      window.removeEventListener(TENANT_CACHE_EVENT, onTenantCacheChange);
      authSub.unsubscribe();
      detenerCitasEnVivo();
      detenerVentasEnVivo();
      detenerPedidosEnVivo();
      detenerNegocioEnVivo();
      detenerGastosEnVivo();
      detenerCajaEnVivo();
      detenerClientesEnVivo();
      detenerCatalogoEnVivo();
    };
  }, [loadFromDemoPreview]);

  // Bug real: una cita nueva reservada desde /b/[slug] mientras el dueño
  // tiene Agenda abierta llega por escucharCitasEnVivo (arriba) y SOLO
  // hacía setSessionState — nunca tocaba `cachedTenant` (el cache
  // compartido en memoria del módulo). Mismo hueco en el resto de
  // escuchar*EnVivo (ventas, pedidos, negocio, gastos, caja, clientes):
  // ninguno pasa por actualizarCacheTenant(), a diferencia de update()
  // (abajo), que sí lo hace explícito tras cada cambio local. Resultado:
  // el dueño navegaba de Agenda a Clientes y de vuelta — el mount de
  // Agenda se destruye, y el nuevo mount de useSession() en la Agenda que
  // vuelve a montar reusa `cachedTenant` (ver "reusando cache" en
  // resolveForUser arriba) para no repetir 7+ queries, pero ese cache
  // nunca se había enterado del insert por realtime — la cita recién
  // agendada desaparecía hasta un F5 duro (que sí pega directo a Supabase).
  // Este efecto cierra el hueco en un solo lugar para las 7 fuentes de
  // cambio a la vez: cualquier cambio a `session` (venga de update() local
  // o de cualquier canal de realtime) se refleja también en el cache
  // compartido, así un remount siempre parte de datos al día.
  useEffect(() => {
    if (session && sourceRef.current === "supabase" && session.business.ownerId) {
      actualizarCacheTenant(session.business.ownerId, session);
    }
  }, [session]);

  const update = useCallback((updater: (prev: TenantData) => TenantData, opciones?: { ventaOffline?: boolean; yaSincronizado?: boolean }) => {
    const prev = sessionRef.current;
    if (!prev) return;

    // Parte 3 de PWA — "solo se permite vender sin conexión" es una
    // decisión de diseño, no un detalle: por defecto, cualquier update()
    // sin red se rechaza (nada se aplica, ni en memoria) a menos que quien
    // llama lo marque explícitamente como un flujo de venta. Esto bloquea
    // TODA otra pantalla (alta de productos, ajustar stock, configuración,
    // reportes, empleados, etc.) desde un solo lugar, sin tener que tocar
    // cada una — ver camposEmpleado()/los 5 flujos de venta marcados. Solo
    // aplica a negocios reales (sourceRef "supabase"): el modo demo no
    // tiene inventario/empleados de verdad que proteger, y bloquearlo
    // confundiría a un prospecto probando la demo con wifi inestable.
    if (sourceRef.current === "supabase" && !opciones?.ventaOffline && typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("Sin conexión: solo puedes seguir vendiendo");
      return;
    }

    const next = updater(prev);
    setSessionState(next);

    if (sourceRef.current === "demo") {
      writeDemoPreview(next);
    } else if (sourceRef.current === "supabase") {
      // Avisa a todas las demás instancias de useSession() en la pestaña
      // (otra página ya montada, el shell) para que se pongan al día sin
      // esperar un remount ni depender del realtime — ver TENANT_CACHE_EVENT.
      if (next.business.ownerId) {
        actualizarCacheTenant(next.business.ownerId, next);
      }
      // yaSincronizado (PR #123, bug crítico de gastos que se perdían al
      // refrescar): quien llama YA esperó la confirmación real de Supabase
      // ANTES de tocar el estado local (ver insertGastoDirecto en
      // lib/data.ts) — si syncTenantDiff volviera a correr aquí, vería el
      // mismo id como "nuevo" (no estaba en `prev`) e intentaría
      // insertarlo OTRA VEZ, chocando con la llave primaria. Nunca se usa
      // para editar/borrar lo que ya existía en `prev` — solo para altas
      // que el propio llamador ya insertó a mano.
      //
      // Sin red, syncTenantDiff fallaría de todos modos (esto solo puede
      // llegar aquí si opciones.ventaOffline dejó pasar una venta sin
      // conexión) — la Parte 4 sube lo pendiente cuando regrese la señal,
      // no tiene caso intentarlo ni ensuciar la consola con el error.
      if (!opciones?.yaSincronizado && (typeof navigator === "undefined" || navigator.onLine)) {
        const escritura = syncTenantDiff(prev, next).catch((err) => {
          // Antes esto solo iba a console.error: si Supabase rechazaba el
          // guardado (columna faltante por una migración no corrida, RLS,
          // lo que sea), la pantalla ya había aplicado el cambio de forma
          // optimista y se veía como si hubiera funcionado — la venta/gasto/
          // cita desaparecía sin aviso en cuanto alguien recargaba o volvía
          // a entrar. Con esto, quien esté usando la app en ese momento se
          // entera de inmediato y sabe que tiene que reintentar, en vez de
          // enterarse horas después de que "no se guardó nada".
          // Choque de horario: alguien apartó ese hueco primero (lo decide
          // el índice único de la base, ver migración 20260913000002). Gana
          // el primero; al segundo hay que decirle QUÉ pasó, no un "no se
          // pudo guardar" que suena a falla de red y lo deja reintentando
          // el mismo horario para siempre.
          if (err instanceof HorarioYaApartadoError) {
            const cuando = err.hora ? ` de las ${formatHora12(err.hora)}` : "";
            toast.error(`Ese horario${cuando} ya lo apartó alguien más desde otro dispositivo. Elige otra hora.`, { duration: 9000 });
            // La pantalla ya se pintó con la cita de forma optimista, así
            // que ahorita muestra un apartado que NO existe en la base. Se
            // vuelven a pedir las citas para que quede lo que de verdad hay
            // (el apartado del que ganó) en vez de un fantasma que
            // desaparecería al recargar, cuando ya sea tarde.
            const negocioId = sessionRef.current?.business.id;
            if (negocioId) {
              fetchCitasDeNegocio(negocioId)
                .then((citasFrescas) => {
                  setSessionState((actual) => (actual?.barberia ? { ...actual, barberia: { ...actual.barberia, citas: citasFrescas } } : actual));
                })
                .catch((e) => console.error("No se pudieron recargar las citas tras el choque de horario:", e));
            }
            return;
          }
          console.error("No se pudo guardar el cambio en Supabase:", err);
          toast.error("No se pudo guardar en el servidor. Revisa tu conexión e inténtalo de nuevo.", { duration: 8000 });
        });
        escriturasPendientes.add(escritura);
        escritura.finally(() => escriturasPendientes.delete(escritura));
      }
    }
  }, []);

  /** Convierte una demo local (o un negocio recién armado en /onboarding) en el negocio real del usuario. */
  const claim = useCallback(async (tenant: TenantData, ownerId: string) => {
    const activated: TenantData = {
      ...tenant,
      business: { ...tenant.business, ownerId, demo: false, is_active: true, trial_fin: todayISO(7) },
    };
    await persistTenant(activated, ownerId);
    clearDemoPreview();
    limpiarModoPreview();
    sourceRef.current = "supabase";
    setSessionState(activated);
    // La siguiente pantalla que monte useSession() para este mismo usuario
    // (p. ej. al navegar a /app/inicio justo después de esto) reusa este
    // resultado en vez de volver a pegarle a Supabase — evita depender de
    // que el negocio recién insertado ya esté 100% consistente para lectura
    // en ese mismo instante.
    actualizarCacheTenant(ownerId, activated);
    return activated;
  }, []);

  const clear = useCallback(async () => {
    clearDemoPreview();
    limpiarModoPreview();
    sourceRef.current = null;
    setSessionState(null);
    limpiarCacheTenant();
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
  }, []);

  return { session, ready, update, claim, clear };
}
