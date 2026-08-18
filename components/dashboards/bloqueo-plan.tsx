"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Candado genérico para features/límites que dependen del plan (distinto de
 * PlanGate: ese solo gatea el mapa plano PlanFeatures de lib/planes.ts —
 * este toma un booleano ya resuelto por quien llama, así sirve para límites
 * POR GIRO como "editor de ventas", "recordatorio de cobro" o "mensaje a 28
 * días" que no existen en los 3 verticales por igual). Trae el CTA a
 * /planes que PlanGate no tiene.
 */
export function BloqueoPlan({
  activo,
  titulo = "Solo Pro",
  texto,
  compacto = false,
  blur = false,
  children,
}: {
  /** true = el negocio SÍ tiene esta feature/límite disponible → se renderiza `children` tal cual. */
  activo: boolean;
  titulo?: string;
  texto: string;
  /** Versión chica (una línea, sin candado) para envolver un solo botón/toggle en vez de una sección completa. */
  compacto?: boolean;
  /**
   * En vez de reemplazar `children` por la tarjeta de upsell, los deja
   * visibles detrás (opacity-60 + blur-[1px], sin interacción) con el
   * candado encima — "se antoja" la función real en vez de un placeholder
   * vacío. Pensado para UNA sola tarjeta/sección (no listas completas, ahí
   * sigue siendo mejor el reemplazo normal). Ignora `compacto`.
   */
  blur?: boolean;
  children?: React.ReactNode;
}) {
  if (activo) return <>{children}</>;

  if (blur) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <div aria-hidden className="pointer-events-none select-none blur-[1px] opacity-60">
          {children}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/40 px-6 text-center">
          <span className="text-2xl">🔒</span>
          <p className="text-sm font-semibold text-foreground">{titulo}</p>
          <p className="text-xs text-muted-foreground">{texto}</p>
          <Button asChild size="sm" className="mt-1">
            <Link href="/planes">Sube de plan</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (compacto) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="truncate text-xs text-muted-foreground">{texto}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href="/planes">Ver planes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center">
      <Lock className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="text-xs text-muted-foreground">{texto}</p>
      <Button asChild size="sm" className="mt-2">
        <Link href="/planes">Ver planes</Link>
      </Button>
    </div>
  );
}
