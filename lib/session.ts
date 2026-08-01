"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { supabase, isSupabaseConfigured } from "./supabase";
import { fetchNegocioByOwner, fetchTenantData, persistTenant, syncTenantDiff } from "./data";
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
  sessionRef.current = session;

  const loadFromDemoPreview = useCallback(() => {
    const demo = readDemoPreview();
    sourceRef.current = demo ? "demo" : null;
    setSessionState(demo);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (!isSupabaseConfigured) {
        loadFromDemoPreview();
        setReady(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;

      if (!user) {
        loadFromDemoPreview();
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const business = await fetchNegocioByOwner(user.id);
        if (cancelled) return;
        if (business) {
          const tenant = await fetchTenantData(business);
          if (cancelled) return;
          sourceRef.current = "supabase";
          setSessionState(tenant);
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

    resolve();

    const onDemoChange = () => {
      if (sourceRef.current !== "supabase") loadFromDemoPreview();
    };
    window.addEventListener(DEMO_PREVIEW_EVENT, onDemoChange);
    window.addEventListener("storage", onDemoChange);

    const authSub = isSupabaseConfigured
      ? supabase.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT") {
            sourceRef.current = null;
            setSessionState(null);
          }
        }).data.subscription
      : null;

    return () => {
      cancelled = true;
      window.removeEventListener(DEMO_PREVIEW_EVENT, onDemoChange);
      window.removeEventListener("storage", onDemoChange);
      authSub?.unsubscribe();
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
      business: { ...tenant.business, ownerId, demo: false, is_active: true, trial_fin: todayISO(7) },
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
