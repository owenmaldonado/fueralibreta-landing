"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase, isSupabaseConfigured } from "./supabase";
import { fetchNegocioByOwner, fetchTenantData, persistTenant, syncTenantDiff, citaFromRow, fetchVentaConItems, businessFromRow } from "./data";
import { readDemoPreview, writeDemoPreview, clearDemoPreview, DEMO_PREVIEW_EVENT } from "./demoPreview";
import { leerCacheLocal, sincronizarCacheLocalEnSegundoPlano } from "./local-cache";
import { todayISO } from "./mock";
import type { Appointment, Business, GrocerySale, TenantData } from "./types";

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

function suscribirseACitasEnVivo(negocioId: string, onEvento: (evento: EventoCita) => void): () => void {
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
    const nuevoCanal = supabase
      .channel(`citas-${negocioId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "barberia_citas", filter: `negocio_id=eq.${negocioId}` },
        (payload) => {
          const cita = citaFromRow(payload.new as Record<string, unknown>);
          citasListeners.forEach((l) => l({ tipo: "insert", cita }));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "barberia_citas", filter: `negocio_id=eq.${negocioId}` },
        (payload) => {
          const cita = citaFromRow(payload.new as Record<string, unknown>);
          citasListeners.forEach((l) => l({ tipo: "update", cita }));
        }
      )
      .subscribe();
    citasChannel = nuevoCanal;
    citasChannelNegocioId = negocioId;
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
  const ventasUnsubRef = useRef<(() => void) | null>(null);
  const negocioUnsubRef = useRef<(() => void) | null>(null);
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
    }

    function detenerVentasEnVivo() {
      ventasUnsubRef.current?.();
      ventasUnsubRef.current = null;
    }

    function detenerNegocioEnVivo() {
      negocioUnsubRef.current?.();
      negocioUnsubRef.current = null;
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

    /** Ver comentario de suscribirseANegocioEnVivo arriba — aplica a los 3 verticales, no solo a uno. */
    function escucharNegocioEnVivo(negocioId: string) {
      detenerNegocioEnVivo();
      negocioUnsubRef.current = suscribirseANegocioEnVivo(negocioId, (business) => {
        setSessionState((prev) => (prev ? { ...prev, business } : prev));
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
            fetch = fetchTenantFresco(userId);
            fetchesEnVuelo.set(userId, fetch);
            fetch.finally(() => fetchesEnVuelo.delete(userId));
          } else {
            console.log("[session] esperando fetch ya en vuelo para", userId);
          }
          tenant = await conTimeout(fetch, 15000, `fetchTenantFresco(${userId})`);
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
          if (tenant.business.tipo === "barberia") {
            try {
              escucharCitasEnVivo(tenant.business.id);
            } catch (err) {
              console.error("[session] no se pudo suscribir a citas en vivo (la sesión sigue cargada bien):", err);
            }
          } else if (tenant.business.tipo === "abarrotes") {
            try {
              escucharVentasEnVivo(tenant.business.id);
            } catch (err) {
              console.error("[session] no se pudo suscribir a ventas en vivo (la sesión sigue cargada bien):", err);
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
        if (!pintadoDesdeCache) loadFromDemoPreview();
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
        detenerNegocioEnVivo();
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
      detenerNegocioEnVivo();
    };
  }, [loadFromDemoPreview]);

  const update = useCallback((updater: (prev: TenantData) => TenantData, opciones?: { ventaOffline?: boolean }) => {
    const prev = sessionRef.current;
    if (!prev) return;

    // Parte 3 de PWA — "solo se permite vender sin conexión" es una
    // decisión de diseño, no un detalle: por defecto, cualquier update()
    // sin red se rechaza (nada se aplica, ni en memoria) a menos que quien
    // llama lo marque explícitamente como un flujo de venta. Esto bloquea
    // TODA otra pantalla (alta de productos, ajustar stock, configuración,
    // reportes, empleados, etc.) desde un solo lugar, sin tener que tocar
    // cada una — ver camposEmpleado()/los 5 flujos de venta marcados.
    // Aplica también al modo demo a propósito: es la única forma de probar
    // este bloqueo sin una cuenta real de Supabase (así se detectó que una
    // excepción anterior para demo dejaba pasar todo en /app/gastos sin
    // avisar — ver PR #68).
    if (!opciones?.ventaOffline && typeof navigator !== "undefined" && !navigator.onLine) {
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
      // Sin red, syncTenantDiff fallaría de todos modos (esto solo puede
      // llegar aquí si opciones.ventaOffline dejó pasar una venta sin
      // conexión) — la Parte 4 sube lo pendiente cuando regrese la señal,
      // no tiene caso intentarlo ni ensuciar la consola con el error.
      if (typeof navigator === "undefined" || navigator.onLine) {
        syncTenantDiff(prev, next).catch((err) => {
          console.error("No se pudo guardar el cambio en Supabase:", err);
        });
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
