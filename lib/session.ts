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

    async function resolveForUser(userId: string | null) {
      if (!userId) {
        loadFromDemoPreview();
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const business = await fetchNegocioByOwner(userId);
        if (cancelled) return;
        if (business) {
          const tenant = await fetchTenantData(business);
          if (cancelled) return;
          sourceRef.current = "supabase";
          setSessionState(tenant);
          if (tenant.business.tipo === "barberia") escucharCitasEnVivo(business.id);
        } else {
          // Logueado pero sin negocio todavía: puede tener una demo local por activar.
          loadFromDemoPreview();
        }
      } catch (err) {
        console.error("No se pudo cargar el negocio desde Supabase:", err);
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
      syncTenantDiff(prev, next).catch((err) => {
        console.error("No se pudo guardar el cambio en Supabase:", err);
      });
    }
  }, []);

  /** Convierte una demo local (o un negocio recién armado en /onboarding) en el negocio real del usuario. */
  const claim = useCallback(async (tenant: TenantData, ownerId: string) => {
    const activated: TenantData = {
      ...tenant,
      business: {
        ...tenant.business,
        ownerId,
        demo: false,
        is_active: true,
        // Se reinician aquí (no en createBusiness) porque la demo pudo
        // armarse en el navegador días antes de activarse: la prueba de 7
        // días debe empezar a contar desde AHORA, no desde que se tocó por
        // primera vez /demo/[tipo].
        plan: "pro",
        estado: "prueba",
        fechaInicioPrueba: todayISO(0),
        fechaVencimiento: todayISO(7),
      },
    };
    await persistTenant(activated, ownerId);
    clearDemoPreview();
    sourceRef.current = "supabase";
    setSessionState(activated);
    return activated;
  }, []);

  const clear = useCallback(async () => {
    clearDemoPreview();
    sourceRef.current = null;
    setSessionState(null);
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
  }, []);

  return { session, ready, update, claim, clear };
}
