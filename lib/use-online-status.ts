"use client";

import { useEffect, useState } from "react";

/** navigator.onLine en el primer render server-side no existe -> arranca en
 * true (mismo valor en servidor y cliente, sin mismatch de hidratación) y se
 * corrige apenas monta, además de reaccionar a los eventos online/offline. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
