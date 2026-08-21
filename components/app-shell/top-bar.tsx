"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, LogOut, X, ShieldCheck, Users } from "lucide-react";

import { clearEmpleadoActual } from "@/lib/empleados";
import { cerrarSesion } from "@/lib/logout";
import { universalSearch } from "@/lib/search";
import { esperarSincronizacionPendiente } from "@/lib/session";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { PinDuenoForm } from "@/components/kiosko/pin-dueno";
import { ConnectionStatus } from "./connection-status";
import { PendingSalesBadge } from "./pending-sales-badge";
import { TurnoControl } from "./turno-control";
import type { TenantData, EmpleadoActual } from "@/lib/types";

export function TopBar({
  data,
  isAdmin,
  empleadoActual,
  pinDuenoSet,
  onSesionCambiada,
}: {
  data: TenantData;
  isAdmin?: boolean;
  /** Quién está atendiendo en este dispositivo AHORA (login opcional por sesión, ver TurnoControl) — null = dueño, sin nadie elegido. */
  empleadoActual?: EmpleadoActual | null;
  /** El dueño configuró un PIN maestro (Ajustes > Empleados) — si no, volver a DUEÑO o entrar a Empleados nunca pide PIN. */
  pinDuenoSet?: boolean;
  onSesionCambiada?: (empleado: EmpleadoActual | null) => void;
}) {
  const [searching, setSearching] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [pinDueno, setPinDueno] = React.useState(false);
  const router = useRouter();
  const results = React.useMemo(() => universalSearch(data, q), [data, q]);

  function closeSearch() {
    setSearching(false);
    setQ("");
  }

  async function logout() {
    await cerrarSesion(data.business.id, (href) => router.push(href));
  }

  // Icono de Empleados del header: siempre visible. Si ya está atendiendo
  // el propio dueño (o nadie, que es lo mismo), entra directo. Si hay un
  // encargado/vendedor logueado, pide el PIN maestro solo si está
  // configurado — si no, entra directo también (el middleware sigue
  // bloqueando /app/empleados por rol de la cookie de todos modos). Este
  // estado (pinDueno) es propio de TopBar, independiente del Dialog de
  // TurnoControl — no comparten ningún state, así que un selector de
  // turno colgado no debería poder bloquear este botón (y ahora tampoco
  // se puede quedar colgado: ver el timeout en verificarPinDueno).
  function accederEmpleados() {
    if (!empleadoActual || empleadoActual.rol === "dueno" || !pinDuenoSet) {
      router.push("/app/empleados");
      return;
    }
    setPinDueno(true);
  }

  function handlePinDuenoExito() {
    setPinDueno(false);
    router.push("/app/empleados");
  }

  /**
   * Salida de emergencia: Shift+click en el nombre del negocio fuerza a
   * modo Dueño sin pasar por PIN ni por el selector — pensado para un
   * dispositivo que se quedó atorado en modo empleado y ya no deja llegar
   * a ningún botón normal (p. ej. una cookie fl_empleado corrupta que el
   * middleware bloquea, o cualquier estado raro no previsto). No requiere
   * confirmar nada porque Shift+click no es algo con lo que alguien
   * tropiece por accidente, y solo cierra sesión de EMPLEADO — nunca la de
   * Supabase Auth real.
   */
  async function resetEmergencia(e: React.MouseEvent) {
    if (!e.shiftKey) return;
    e.preventDefault();
    clearEmpleadoActual();
    // Ver esperarSincronizacionPendiente en turno-control.tsx: mismo riesgo
    // de cancelar a medias un guardado en segundo plano.
    await esperarSincronizacionPendiente();
    window.location.href = "/app/inicio";
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4">
        {searching ? (
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente, pedido, producto..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="button" onClick={closeSearch} aria-label="Cerrar búsqueda">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1 leading-tight">
              <span onClick={resetEmergencia} className="truncate font-display text-sm font-semibold">
                {data.business.nombre}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {data.business.demo ? "Modo demo" : data.business.dueno}
              </span>
            </div>
            {isAdmin && (
              <Link
                href="/admin"
                className="flex shrink-0 items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/15 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-purple-300 transition-colors hover:bg-purple-500/25"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Admin
              </Link>
            )}
            <TurnoControl
              negocioId={data.business.id}
              empleadoActual={empleadoActual ?? null}
              pinDuenoSet={Boolean(pinDuenoSet)}
              onSesionCambiada={(e) => onSesionCambiada?.(e)}
            />
            <PendingSalesBadge negocioId={data.business.id} />
            <ConnectionStatus negocioId={data.business.id} />
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Buscar"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={accederEmpleados}
              className="relative z-10 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Empleados"
            >
              <Users className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {searching && q.trim() && (
        <div className="max-h-[60vh] overflow-y-auto border-t border-border/60 bg-background px-4 py-2">
          {results.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin resultados para “{q}”.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {results.map((r, i) => (
                <Link
                  key={`${r.href}-${i}`}
                  href={r.href}
                  onClick={closeSearch}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.sublabel}</p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-primary">{r.group}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={pinDueno} onOpenChange={(o) => !o && setPinDueno(false)}>
        <DialogHeader title="Acceso a Empleados" description="Ingresa el PIN maestro del dueño" onClose={() => setPinDueno(false)} />
        <PinDuenoForm negocioId={data.business.id} onExito={handlePinDuenoExito} onCancel={() => setPinDueno(false)} />
      </Dialog>
    </header>
  );
}
