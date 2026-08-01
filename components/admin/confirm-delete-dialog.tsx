"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/** Confirmación reforzada para acciones destructivas: hay que escribir ELIMINAR. */
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = "Eliminar",
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const canConfirm = text.trim().toUpperCase() === "ELIMINAR";

  React.useEffect(() => {
    if (!open) {
      setText("");
      setLoading(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (!canConfirm || loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader title={title} description={description} onClose={onClose} />
      <div className="space-y-1.5">
        <Label>
          Escribe <span className="text-destructive">ELIMINAR</span> para confirmar
        </Label>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="ELIMINAR" autoFocus />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disabled={!canConfirm || loading}
          onClick={handleConfirm}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
