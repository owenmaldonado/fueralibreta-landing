"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/session";
import { cerrarSesion } from "@/lib/logout";
import { BarberiaDashboard } from "./barberia-dashboard";
import { FondaDashboard } from "./fonda-dashboard";
import { AbarrotesDashboard } from "./abarrotes-dashboard";

/** Elige el dashboard correcto según el tipo de negocio de la sesión activa. */
export function DashboardRouter() {
  const { session, ready, update } = useSession();
  const router = useRouter();

  if (!ready || !session) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function cambiarCuenta() {
    await cerrarSesion(session!.business.id, (href) => router.push(href));
  }

  return (
    <>
      {session.business.tipo === "barberia" && <BarberiaDashboard session={session} update={update} />}
      {session.business.tipo === "fonda" && <FondaDashboard session={session} update={update} />}
      {session.business.tipo === "abarrotes" && <AbarrotesDashboard session={session} update={update} />}

      {/* Multicuenta: para entrar con otro Google sin que la sesión guardada
          lo mande directo al negocio anterior — mismo guardia de ventas
          pendientes que el logout del TopBar (ver lib/logout.ts). */}
      <div className="flex justify-center px-4 pb-8 pt-2">
        <button
          type="button"
          onClick={cambiarCuenta}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Cambiar cuenta / Cerrar sesión
        </button>
      </div>
    </>
  );
}
