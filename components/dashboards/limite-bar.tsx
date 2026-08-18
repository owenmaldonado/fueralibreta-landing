"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Contador "X/Y (Plan)" con barra de progreso, siempre visible (no solo al
 * llegar al tope) — el pedido explícito fue que "duela" ver cuánto falta
 * para el límite, no solo enterarse cuando ya se topó. `max: null` = plan
 * sin límite en ese renglón, no se renderiza nada.
 */
export function LimiteBar({
  actual,
  max,
  etiqueta,
  planLabel,
}: {
  actual: number;
  max: number | null;
  /** Plural del recurso, ej. "clientes", "servicios", "productos". */
  etiqueta: string;
  planLabel: string;
}) {
  if (max === null) return null;

  const lleno = actual >= max;
  const pct = Math.min(100, Math.round((actual / max) * 100));

  return (
    <div className="mx-4 mb-3 flex flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={cn("font-medium", lleno ? "text-primary" : "text-foreground")}>
          {actual}/{max} {etiqueta} ({planLabel})
        </span>
        {lleno && (
          <Link href="/planes" className="shrink-0 font-medium text-primary hover:underline">
            Sube de plan
          </Link>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full transition-all", lleno ? "bg-primary" : "bg-primary/60")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
