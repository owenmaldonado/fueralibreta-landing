"use client";

import * as React from "react";

import { formatMoneyExacto } from "@/lib/mock";
import { permisosActuales } from "@/lib/empleados";
import { cn } from "@/lib/utils";

/**
 * La cuenta, renglón por renglón, arriba del campo de efectivo contado.
 *
 * POR QUÉ
 * Owen: "me gustaría que hiciera la suma ahí abajito de donde va lo que
 * tiene hoy al cerrar turno, haciendo las restas o sumas de las acciones del
 * día". Y tenía una razón concreta para pedirlo: encontró un cierre donde el
 * esperado no le cuadraba y no había forma de ver de dónde salía el número.
 * Un total suelto no se puede auditar; una suma con sus renglones sí.
 *
 * QUIÉN LA VE
 * Solo quien tiene `verCorteDelDia` — o sea, el dueño. El vendedor cierra a
 * ciegas (ver MensajeCorte): si viera el desglose podría sumarlo de cabeza y
 * escribir el total exacto, y la diferencia del reporte de Cierres dejaría
 * de significar nada. No es desconfianza hacia el vendedor: es que un
 * conteo que se puede cuadrar de antemano no sirve como conteo.
 *
 * Igual que MensajeCorte, arranca oculto y se destapa en un efecto —
 * permisosActuales() lee una cookie, y conviene que el cambio sea de tapado
 * a destapado y nunca al revés.
 */

export interface RenglonCorte {
  concepto: string;
  monto: number;
  /** "suma" entra a la caja, "resta" sale. Decide el signo y el color. */
  tipo: "suma" | "resta";
}

export function DesgloseCorte({
  renglones,
  esperado,
  desdeCuando,
}: {
  renglones: RenglonCorte[];
  esperado: number;
  /** "Desde el último cierre, a las 2:30 pm" — para que se entienda por qué el número es ese. */
  desdeCuando?: string;
}) {
  const [puedeVer, setPuedeVer] = React.useState(false);

  React.useEffect(() => {
    setPuedeVer(permisosActuales().verCorteDelDia);
  }, []);

  if (!puedeVer) return null;

  const visibles = renglones.filter((r) => r.monto !== 0);
  if (visibles.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">La cuenta</p>
        {desdeCuando && <p className="text-[11px] text-muted-foreground">{desdeCuando}</p>}
      </div>

      <div className="mt-2 flex flex-col gap-1">
        {visibles.map((r, i) => (
          <div key={`${r.concepto}-${i}`} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">{r.concepto}</span>
            <span
              className={cn(
                "shrink-0 font-mono tabular-nums",
                r.tipo === "resta" ? "text-destructive" : "text-foreground"
              )}
            >
              {r.tipo === "resta" ? "−" : "+"}
              {formatMoneyExacto(r.monto)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2">
        <span className="text-xs font-semibold">Deberías tener</span>
        <span className="font-mono text-sm font-bold tabular-nums text-ledger">{formatMoneyExacto(esperado)}</span>
      </div>
    </div>
  );
}
