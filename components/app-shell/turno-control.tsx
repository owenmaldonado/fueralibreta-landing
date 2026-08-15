"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SeleccionarEmpleado, ROL_LABEL } from "@/components/kiosko/quien-atiende";
import type { EmpleadoActual } from "@/lib/types";

/**
 * Botón "Vendedor: Dueño" / "Atendiendo: Juan (Vendedor)" del header —
 * login de vendedor OPCIONAL y POR SESIÓN, no por venta. Sin nadie elegido
 * aquí la app funciona exactamente como un negocio de una sola persona
 * (nunca pide PIN solo). Tocarlo abre este control: si ya hay alguien
 * atendiendo, primero un resumen con "Cambiar de usuario" / "Cerrar
 * turno"; si no, directo a la lista de empleados + PIN (ver
 * SeleccionarEmpleado). La sesión se guarda en la cookie fl_empleado (ver
 * lib/empleados.ts) hasta que se cierra el turno explícitamente.
 */
export function TurnoControl({
  negocioId,
  empleadoActual,
  onSesionCambiada,
}: {
  negocioId: string;
  empleadoActual: EmpleadoActual | null;
  onSesionCambiada: (empleado: EmpleadoActual | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [eligiendo, setEligiendo] = React.useState(false);

  function cerrar() {
    setOpen(false);
    setEligiendo(false);
  }

  function handleExito(empleado: EmpleadoActual) {
    onSesionCambiada(empleado);
    cerrar();
  }

  function cerrarTurno() {
    onSesionCambiada(null);
    cerrar();
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
        className="flex items-center gap-1 truncate rounded-full bg-secondary/60 px-2.5 py-1 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-secondary"
      >
        <span className="truncate">
          👤 {empleadoActual ? `Atendiendo: ${empleadoActual.nombre} (${ROL_LABEL[empleadoActual.rol]})` : "Vendedor: Dueño"}
        </span>
        <ChevronRight className="h-3 w-3 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
        {mostrarLista ? (
          <>
            <DialogHeader title="¿Quién atiende?" description="Toca tu nombre y escribe tu PIN" onClose={cerrar} />
            <SeleccionarEmpleado negocioId={negocioId} onExito={handleExito} />
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
              <Button size="lg" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={cerrarTurno}>
                Cerrar turno
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
