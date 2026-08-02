"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Confirmación simple de "¿seguro?" para eliminar algo desde cualquier lista. */
export function ConfirmDialog({
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
  onConfirm: () => void;
}) {
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) setLoading(false);
  }, [open]);

  function handleConfirm() {
    setLoading(true);
    onConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader title={title} description={description} onClose={onClose} />
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disabled={loading}
          onClick={handleConfirm}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
