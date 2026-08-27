"use client";

import { SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * Pantalla de "no se puede cerrar ahorita" que comparten los tres wizards
 * de cierre (barbería, fonda, abarrotera). Dos motivos:
 *
 * - "ya cerrado": el corte de hoy ya existe en Supabase. Cerrar dos veces
 *   el mismo día duplica gastos y descuadra la contabilidad del dueño.
 *
 * - "sin conexión": el cierre NO es una venta, y a diferencia de una venta
 *   no se puede encolar y ya. Escribe el corte y las mermas directo a
 *   Supabase (cleanInsert) y los gastos con insertGastoDirecto, que esperan
 *   la confirmación del servidor; además el guardia de update() rechaza
 *   cualquier cambio no marcado como venta. Sin señal eso se quedaba a
 *   MEDIAS: el corte no se guardaba, el gasto del día se perdía y quien
 *   cerró se iba pensando que había quedado. Mejor decirlo claro y que el
 *   turno se cierre cuando vuelva la señal — las ventas que ya se hicieron
 *   sin conexión siguen guardadas y en la cola, no se pierde nada.
 */
export function CierreBloqueado({
  motivo,
  titulo,
  queEs,
  onClose,
}: {
  motivo: "ya-cerrado" | "sin-conexion";
  /** Título del sheet, ej. "Turno cerrado" / "Sin conexión". */
  titulo: string;
  /** Cómo se le llama en esta app: "turno" (barbería/fonda) o "día" (abarrotera). */
  queEs: "turno" | "día";
  onClose: () => void;
}) {
  const yaCerrado = motivo === "ya-cerrado";
  return (
    <>
      <SheetHeader
        title={titulo}
        description={yaCerrado ? `Hoy ya fue cerrado` : "Necesitas señal para cerrar"}
        onClose={onClose}
      />
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
          {yaCerrado ? (
            <>
              <p className="text-center text-sm font-medium text-destructive">✓ El {queEs} de hoy ya fue cerrado.</p>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                No se puede cerrar {queEs === "día" ? "el día" : "turno"} 2 veces el mismo día. Mañana podrás cerrar uno nuevo.
              </p>
            </>
          ) : (
            <>
              <p className="text-center text-sm font-medium text-destructive">Sin conexión no se puede cerrar el {queEs}.</p>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                El corte, las mermas y el gasto del día se guardan en el servidor, no en el teléfono. Sigue vendiendo normal — todo lo que
                cobres queda guardado — y cierra el {queEs} cuando vuelva la señal.
              </p>
            </>
          )}
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" variant="outline" onClick={onClose}>
          Entendido
        </Button>
      </SheetFooter>
    </>
  );
}
