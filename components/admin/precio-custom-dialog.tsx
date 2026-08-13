"use client";

import * as React from "react";

import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { AdminNegocio } from "@/lib/admin-data";

/** Precio negociado a mano para un negocio, en vez del precio de lista de su plan. Vacío/quitar = regresa al precio normal. */
export function PrecioCustomDialog({
  negocio,
  onClose,
  onSave,
}: {
  negocio: AdminNegocio | null;
  onClose: () => void;
  onSave: (negocioId: string, precio: number | null) => void;
}) {
  const [valor, setValor] = React.useState("");

  React.useEffect(() => {
    setValor(negocio?.precioCustom != null ? String(negocio.precioCustom) : "");
  }, [negocio]);

  function guardar() {
    if (!negocio) return;
    const n = Number(valor);
    if (valor.trim() === "" || !Number.isFinite(n) || n < 0) return;
    onSave(negocio.id, n);
    onClose();
  }

  function quitar() {
    if (!negocio) return;
    onSave(negocio.id, null);
    onClose();
  }

  return (
    <Dialog open={!!negocio} onOpenChange={(o) => !o && onClose()} className="max-w-sm">
      <DialogHeader
        title="Precio custom"
        description={negocio ? `Para ${negocio.nombre} — sobreescribe el precio de lista de su plan.` : undefined}
        onClose={onClose}
      />
      <div className="space-y-1.5">
        <Label>Precio mensual (MXN)</Label>
        <Input
          autoFocus
          type="number"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Ej. 350"
        />
      </div>
      <DialogFooter>
        {negocio?.precioCustom != null && (
          <Button variant="outline" onClick={quitar}>
            Quitar precio custom
          </Button>
        )}
        <Button onClick={guardar}>Guardar</Button>
      </DialogFooter>
    </Dialog>
  );
}
