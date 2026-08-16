"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { eliminarVentaPendiente, type VentaPendienteRow } from "@/lib/offline-sales-queue";
import { reintentarUnaVenta } from "@/lib/sync-queue";

/**
 * Etiqueta de estado de una venta que vive en la cola offline (Parte 3/4),
 * para insertar junto a la fila correspondiente en cada historial:
 * - "pendiente": "Por sincronizar" — se sube sola, sin acción del dueño.
 * - "error": "Error: requiere revisión" + Reintentar/Descartar — el
 *   servidor rechazó la subida, reintentar automático no serviría de nada.
 */
export function PendingSaleStatus({ negocioId, fila }: { negocioId: string; fila: VentaPendienteRow | undefined }) {
  const [descartando, setDescartando] = React.useState(false);
  const [reintentando, setReintentando] = React.useState(false);

  if (!fila) return null;

  if (fila.estado !== "error") {
    return (
      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-primary">
        Por sincronizar
      </span>
    );
  }

  async function reintentar() {
    setReintentando(true);
    try {
      await reintentarUnaVenta(negocioId, fila!.id);
    } finally {
      setReintentando(false);
    }
  }

  async function confirmarDescarte() {
    await eliminarVentaPendiente(negocioId, fila!.id);
    setDescartando(false);
    toast.success("Venta descartada de la cola");
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-destructive">
        Error: requiere revisión
      </span>
      {fila.ultimoError && <span className="text-[11px] text-muted-foreground">{fila.ultimoError}</span>}
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={reintentando} onClick={reintentar}>
          {reintentando ? "Reintentando..." : "Reintentar"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 border-destructive/40 px-2 text-[11px] text-destructive hover:bg-destructive/10"
          onClick={() => setDescartando(true)}
        >
          Descartar
        </Button>
      </div>
      <ConfirmDialog
        open={descartando}
        title="Descartar venta"
        description="Esta venta NO se subirá al servidor y desaparece de la cola. Solo descártala si estás seguro — no se puede deshacer."
        confirmLabel="Descartar"
        tone="danger"
        onClose={() => setDescartando(false)}
        onConfirm={confirmarDescarte}
      />
    </div>
  );
}
