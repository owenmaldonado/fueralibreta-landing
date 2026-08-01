"use client";

import { useCallback, useEffect, useState } from "react";

import type { TenantData } from "./types";

const KEY = "fl_session";
const EVENT = "fl_session_change";

export function readSession(): TenantData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TenantData) : null;
  } catch {
    return null;
  }
}

export function writeSession(data: TenantData | null) {
  if (typeof window === "undefined") return;
  if (data === null) {
    window.localStorage.removeItem(KEY);
  } else {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Sesión del negocio activo (dueño logueado). En el MVP vive en
 * localStorage; el shape (TenantData) es el mismo que usaría una fila de
 * Supabase por negocio, así que migrar más adelante es solo cambiar de
 * dónde se lee/escribe.
 */
export function useSession() {
  const [data, setData] = useState<TenantData | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setData(readSession());
    setReady(true);
    const onChange = () => setData(readSession());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((updater: (prev: TenantData) => TenantData) => {
    const prev = readSession();
    if (!prev) return;
    writeSession(updater(prev));
  }, []);

  const clear = useCallback(() => writeSession(null), []);

  return { session: data, ready, update, clear, setSession: writeSession };
}
