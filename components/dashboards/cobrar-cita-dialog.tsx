"use client";

import * as React from "react";

import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { formatMoney } from "@/lib/mock";
import type { Appointment } from "@/lib/types";

/**
 * Pide el método de pago antes de marcar una cita como lista — sin esto Caja
 * no puede sumar el corte a Efectivo/Transferencia, solo al total de Ingresos.
 */
export function CobrarCitaDialog({
  cita,
  onClose,
  onConfirmar,
}: {
  cita: Appointment | null;
  onClose: () => void;
  onConfirmar: (id: string, metodo: "efectivo" | "transferencia") => void;
}) {
  const [metodo, setMetodo] = React.useState<"efectivo" | "transferencia">("efectivo");

  React.useEffect(() => {
    if (cita) setMetodo("efectivo");
  }, [cita]);

  return (
    <Dialog open={!!cita} onOpenChange={(o) => !o && onClose()}>
      {cita && (
        <>
          <DialogHeader
            title="¿Cómo se cobró?"
            description={`${cita.clienteNombre} · ${cita.servicioNombre} · ${formatMoney(cita.precio)}`}
            onClose={onClose}
          />
          <ChipGroup>
            <Chip selected={metodo === "efectivo"} onClick={() => setMetodo("efectivo")}>
              Efectivo
            </Chip>
            <Chip selected={metodo === "transferencia"} onClick={() => setMetodo("transferencia")}>
              Transferencia
            </Chip>
          </ChipGroup>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="ledger" onClick={() => onConfirmar(cita.id, metodo)}>
              Marcar como lista
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
