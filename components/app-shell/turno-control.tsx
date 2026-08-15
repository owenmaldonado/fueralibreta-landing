"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SeleccionarEmpleado, ROL_LABEL } from "@/components/kiosko/quien-atiende";
import { PinDuenoForm } from "@/components/kiosko/pin-dueno";
import type { EmpleadoActual } from "@/lib/types";

/**
 * Pill "DUEÑO" / "Atendiendo: Juan" del header — login de vendedor OPCIONAL
 * y POR SESIÓN, no por venta. Sin nadie elegido aquí la app funciona
 * exactamente como un negocio de una sola persona. Siempre visible (no
 * depende de tener empleados dados de alta): un negocio de 1 persona
 * también puede querer ver/confirmar que está en modo DUEÑO.
 *
 * El selector de turno lista una tarjeta "Dueño" siempre disponible arriba
 * de los empleados reales — volver a DUEÑO pide el PIN maestro (ver
 * lib/empleados.ts, pinDuenoConfigurado) SOLO si el dueño configuró uno;
 * si nunca lo configuró, cambiar a DUEÑO no pide nada (mismo criterio que
 * "si no tiene pin, no pide nada" de Ajustes > Empleados).
 */
export function TurnoControl({
  negocioId,
  empleadoActual,
  pinDuenoSet,
  onSesionCambiada,
}: {
  negocioId: string;
  empleadoActual: EmpleadoActual | null;
  pinDuenoSet: boolean;
  onSesionCambiada: (empleado: EmpleadoActual | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [eligiendo, setEligiendo] = React.useState(false);
  const [pidiendoPinDueno, setPidiendoPinDueno] = React.useState(false);

  function cerrar() {
    setOpen(false);
    setEligiendo(false);
    setPidiendoPinDueno(false);
  }

  function handleExito(empleado: EmpleadoActual) {
    onSesionCambiada(empleado);
    cerrar();
  }

  /**
   * "Cerrar turno" REAL: limpia la sesión (ver handleSesionCambiada en
   * AuthenticatedShell, que ahora sí borra la cookie fl_empleado, no solo
   * el estado de React) y fuerza una recarga completa a /app/inicio en vez
   * de dejar que React re-renderice solo — así queda descartado cualquier
   * estado en memoria residual de la sesión anterior (listeners de
   * realtime, caché de useSession, lo que sea), no solo la cookie.
   */
  function volverADuenoYRecargar() {
    onSesionCambiada(null);
    window.location.href = "/app/inicio";
  }

  /** Tarjeta "Dueño" del selector — ya sea desde la lista inicial o desde "Cambiar de usuario"/"Cerrar turno". */
  function elegirDueno() {
    if (!empleadoActual) {
      // Ya es dueño (nadie logueado): nada que hacer.
      cerrar();
      return;
    }
    if (!pinDuenoSet) {
      volverADuenoYRecargar();
      return;
    }
    setPidiendoPinDueno(true);
  }

  function handlePinDuenoExito() {
    volverADuenoYRecargar();
  }

  const mostrarLista = eligiendo || !empleadoActual;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEligiendo(false);
          setOpen(true);
        }}
        className="flex items-center gap-0.5 truncate rounded-full bg-secondary/60 px-2 py-1 text-left font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-secondary"
      >
        <span className="max-w-[7rem] truncate">{empleadoActual ? empleadoActual.nombre : "Dueño"}</span>
        <ChevronRight className="h-3 w-3 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
        {pidiendoPinDueno ? (
          <>
            <DialogHeader title="PIN de dueño" description="Ingresa tu PIN maestro para volver a modo dueño" onClose={cerrar} />
            <PinDuenoForm negocioId={negocioId} onExito={handlePinDuenoExito} onCancel={() => setPidiendoPinDueno(false)} />
          </>
        ) : mostrarLista ? (
          <>
            <DialogHeader title="¿Quién está atendiendo?" description="Toca tu nombre y escribe tu PIN" onClose={cerrar} />
            <SeleccionarEmpleado
              negocioId={negocioId}
              excluirRol={["dueno"]}
              onExito={handleExito}
              extraAlInicio={
                <button
                  type="button"
                  onClick={elegirDueno}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary">
                    D
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">Dueño</p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Acceso completo</p>
                  </div>
                </button>
              }
            />
          </>
        ) : (
          <>
            <DialogHeader
              title={empleadoActual!.nombre}
              description={`Atendiendo como ${ROL_LABEL[empleadoActual!.rol]}`}
              onClose={cerrar}
            />
            <div className="flex flex-col gap-2">
              <Button size="lg" variant="outline" onClick={() => setEligiendo(true)}>
                Cambiar de usuario
              </Button>
              <Button size="lg" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={elegirDueno}>
                Cerrar turno
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
