"use client";

import { Lock } from "lucide-react";

import { usePlan, type PlanFeatures } from "@/lib/planes";

/**
 * Envuelve cualquier bloque que dependa de una feature del plan (hoy solo
 * "graficas") — si el negocio no la tiene, muestra un placeholder con el
 * mismo alto que el estado vacío de las gráficas (h-48) en vez de la
 * gráfica real. Reactivo: usePlan() lee session.business.plan, que se
 * actualiza solo si /admin cambia el plan (ver el canal de realtime de
 * "negocios" en lib/session.ts) — sin F5.
 */
export function PlanGate({
  feature,
  children,
  texto = "Disponible en los planes Pro y Pro+",
}: {
  feature: keyof PlanFeatures;
  children: React.ReactNode;
  texto?: string;
}) {
  const plan = usePlan();
  if (plan.can(feature)) return <>{children}</>;

  return (
    <div className="flex h-48 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-6 text-center">
      <Lock className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium">{texto}</p>
      <p className="text-xs text-muted-foreground">Tu plan actual es {plan.label}.</p>
    </div>
  );
}
