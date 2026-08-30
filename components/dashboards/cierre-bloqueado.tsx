"use client";

import { SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * Pantalla de "no se puede cerrar ahorita" que comparten los tres wizards
 * de cierre (barbería, fonda, abarrotera). Dos motivos:
 *
 * - "ya cerrado": el corte de hoy ya existe en Supabase. ESTO YA NO ES UN
 *   MURO, es un aviso con salida. Antes decía "no se puede cerrar 2 veces
 *   el mismo día" y dejaba ahí, sin más opción que cancelar — y eso está
 *   mal por dos lados: un negocio con dos turnos (mañana y tarde, o dos
 *   personas que se relevan) cierra dos veces el mismo día de forma
 *   perfectamente normal, y si alguien se equivocó al capturar el corte no
 *   tenía manera de rehacerlo hasta el día siguiente. Ahora avisa que ya
 *   hubo un cierre hoy y deja seguir a propósito; cada cierre queda como
 *   su propio corte, que es justo lo que el dueño necesita para revisarlos
 *   por separado (ver /app/cortes).
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
  onContinuar,
}: {
  motivo: "ya-cerrado" | "sin-conexion";
  /** Título del sheet, ej. "Turno cerrado" / "Sin conexión". */
  titulo: string;
  /** Cómo se le llama en esta app: "turno" (barbería/fonda) o "día" (abarrotera). */
  queEs: "turno" | "día";
  onClose: () => void;
  /** Solo para "ya-cerrado": deja seguir de todos modos y abre un cierre nuevo. Sin conexión no hay nada que ofrecer, ahí sí es un muro real. */
  onContinuar?: () => void;
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
        <div className={yaCerrado ? "rounded-xl border border-border bg-card p-4" : "rounded-xl border border-destructive/20 bg-destructive/10 p-4"}>
          {yaCerrado ? (
            <>
              <p className="text-center text-sm font-medium">✓ Hoy ya se cerró un {queEs}.</p>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Si están haciendo otro turno, o el anterior se capturó mal, puedes cerrar otro. Queda registrado aparte y el dueño ve
                los dos por separado.
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
          {yaCerrado && onContinuar ? "Ahora no" : "Entendido"}
        </Button>
        {yaCerrado && onContinuar && (
          <Button size="lg" onClick={onContinuar}>
            Cerrar otro {queEs}
          </Button>
        )}
      </SheetFooter>
    </>
  );
}
