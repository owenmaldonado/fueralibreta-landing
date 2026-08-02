"use client";

import * as React from "react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/mock";

interface AbonoDialogProps {
  open: boolean;
  title: string;
  restante: number;
  onClose: () => void;
  onConfirm: (monto: number) => void;
}

/** Sheet compacto para registrar un abono desde la tarjeta de la lista, sin abrir el perfil completo. */
export function AbonoDialog({ open, title, restante, onClose, onConfirm }: AbonoDialogProps) {
  const [monto, setMonto] = React.useState("");

  React.useEffect(() => {
    if (open) setMonto("");
  }, [open]);

  const puedeGuardar = Number(monto) > 0;

  function guardar() {
    if (!puedeGuardar) return;
    onConfirm(Number(monto));
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetHeader title={title} description={`Debe ${formatMoney(restante)}`} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Monto del abono</Label>
          <Input autoFocus type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0" />
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Registrar abono
        </Button>
      </SheetFooter>
    </Sheet>
  );
}
