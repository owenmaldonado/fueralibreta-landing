"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase, isSupabaseConfigured } from "./supabase";
import { fetchNegocioByOwner, fetchTenantData, persistTenant, syncTenantDiff, citaFromRow } from "./data";
import { readDemoPreview, writeDemoPreview, clearDemoPreview, DEMO_PREVIEW_EVENT } from "./demoPreview";
import { todayISO } from "./mock";
import type { TenantData } from "./types";

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
  const citasChannelRef = useRef<RealtimeChannel | null>(null);
  sessionRef.current = session;

  const loadFromDemoPreview = useCallback(() => {
    const demo = readDemoPreview();
    sourceRef.current = demo ? "demo" : null;
    setSessionState(demo);
  }, []);

  useEffect(() => {
    let cancelled = false;

    function detenerCitasEnVivo() {
      if (citasChannelRef.current) {
        supabase.removeChannel(citasChannelRef.current);
        citasChannelRef.current = null;
      }
    }

    /**
     * Nuevas citas agendadas desde /b/[slug] (un visitante sin sesión, en otra
     * pestaña/dispositivo) deben aparecer en el panel del barbero (Agenda, el
     * "Hoy" del dashboard) sin que tenga que recargar — de ahí esta
     * suscripción en tiempo real, en vez de solo el fetch inicial de arriba.
     * También escucha UPDATE: si el dueño cambia el estado de una cita (Listo,
     * Cancelar, Mover) desde otra pestaña/dispositivo suyo, esta sesión debe
     * verlo también, no solo los inserts nuevos.
     */
    function escucharCitasEnVivo(negocioId: string) {
      detenerCitasEnVivo();
      citasChannelRef.current = supabase
        .channel(`citas-${negocioId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "barberia_citas", filter: `negocio_id=eq.${negocioId}` },
          (payload) => {
            const nueva = citaFromRow(payload.new as Record<string, unknown>);
            setSessionState((prev) => {
              if (!prev?.barberia) return prev;
              if (prev.barberia.citas.some((c) => c.id === nueva.id)) return prev;
              return { ...prev, barberia: { ...prev.barberia, citas: [nueva, ...prev.barberia.citas] } };
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "barberia_citas", filter: `negocio_id=eq.${negocioId}` },
          (payload) => {
            const actualizada = citaFromRow(payload.new as Record<string, unknown>);
            setSessionState((prev) => {
              if (!prev?.barberia) return prev;
              return {
                ...prev,
                barberia: { ...prev.barberia, citas: prev.barberia.citas.map((c) => (c.id === actualizada.id ? actualizada : c)) },
              };
            });
          }
        )
        .subscribe();
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
      console.log("[session] resolveForUser arrancó para", userId);
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
          sourceRef.current = "supabase";
          setSessionState(tenant);
          cachedTenant = { userId, tenant };
          if (tenant.business.tipo === "barberia") escucharCitasEnVivo(tenant.business.id);
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
        }
      } catch (err) {
        console.error("[session] ERROR — no se pudo cargar el negocio desde Supabase:", err);
        loadFromDemoPreview();
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

    if (!isSupabaseConfigured) {
      loadFromDemoPreview();
      setReady(true);
      return () => {
        cancelled = true;
        window.removeEventListener(DEMO_PREVIEW_EVENT, onDemoChange);
        window.removeEventListener("storage", onDemoChange);
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
      authSub.unsubscribe();
      detenerCitasEnVivo();
    };
  }, [loadFromDemoPreview]);

  const update = useCallback((updater: (prev: TenantData) => TenantData) => {
    const prev = sessionRef.current;
    if (!prev) return;
    const next = updater(prev);
    setSessionState(next);

    if (sourceRef.current === "demo") {
      writeDemoPreview(next);
    } else if (sourceRef.current === "supabase") {
      if (next.business.ownerId && cachedTenant?.userId === next.business.ownerId) {
        cachedTenant = { userId: next.business.ownerId, tenant: next };
      }
      syncTenantDiff(prev, next).catch((err) => {
        console.error("No se pudo guardar el cambio en Supabase:", err);
      });
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
    sourceRef.current = "supabase";
    setSessionState(activated);
    // La siguiente pantalla que monte useSession() para este mismo usuario
    // (p. ej. al navegar a /app/inicio justo después de esto) reusa este
    // resultado en vez de volver a pegarle a Supabase — evita depender de
    // que el negocio recién insertado ya esté 100% consistente para lectura
    // en ese mismo instante.
    cachedTenant = { userId: ownerId, tenant: activated };
    return activated;
  }, []);

  const clear = useCallback(async () => {
    clearDemoPreview();
    sourceRef.current = null;
    setSessionState(null);
    limpiarCacheTenant();
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
  }, []);

  return { session, ready, update, claim, clear };
}
