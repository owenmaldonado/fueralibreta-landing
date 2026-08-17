"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/mock";
import { PLAN_ORDEN, PLAN_LABELS, PRECIOS_POR_GIRO, BENEFICIOS_POR_GIRO, type PlanId } from "@/lib/planes";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types";

/**
 * 3 cards de precio, una por plan del giro del negocio — reusada por
 * /planes (consulta libre) y /planes-bloqueado (trial vencido). El precio y
 * los beneficios salen de PRECIOS_POR_GIRO/BENEFICIOS_POR_GIRO en
 * lib/planes.ts según business.tipo, así que un cambio de precio ahí se ve
 * en los 3 lugares (aquí y /admin) sin tocar este componente.
 */
export function PlanesCards({ business, mensajeExtra }: { business: Pick<Business, "id" | "nombre" | "tipo">; mensajeExtra: string }) {
  const numero = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "3329098631";
  const precios = PRECIOS_POR_GIRO[business.tipo];
  const beneficios = BENEFICIOS_POR_GIRO[business.tipo];

  function linkActivar(plan: PlanId) {
    const mensaje = [
      "Hola Owen! Quiero activar FueraLibreta:",
      `Negocio: ${business.nombre}`,
      `Tipo: ${TIPO_LABEL[business.tipo]}`,
      `Plan: ${PLAN_LABELS[plan]}`,
      `$${precios[plan]}/mes`,
      `ID: ${business.id}`,
      mensajeExtra,
    ].join("\n");
    let digits = numero.replace(/\D/g, "");
    if (digits.length === 10) digits = `52${digits}`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(mensaje)}`;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {PLAN_ORDEN.map((plan) => (
        <div
          key={plan}
          className={cn(
            "relative flex flex-col gap-4 rounded-2xl border bg-card p-6",
            plan === "pro" ? "border-primary shadow-[0_0_32px_-8px_hsl(var(--primary)/0.5)]" : "border-border"
          )}
        >
          {plan === "pro" && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
              Más popular
            </span>
          )}
          <div>
            <p className="font-display text-lg font-bold">{PLAN_LABELS[plan]}</p>
            <p className="mt-1 font-display text-3xl font-bold">
              {formatMoney(precios[plan])}
              <span className="text-sm font-normal text-muted-foreground">/mes</span>
            </p>
          </div>
          <ul className="flex flex-1 flex-col gap-2">
            {beneficios[plan].map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-ledger" />
                {b}
              </li>
            ))}
          </ul>
          <Button asChild size="lg" variant={plan === "pro" ? "default" : "outline"}>
            <a href={linkActivar(plan)} target="_blank" rel="noreferrer">
              Activar Plan
            </a>
          </Button>
        </div>
      ))}
    </div>
  );
}

const TIPO_LABEL: Record<Business["tipo"], string> = {
  barberia: "Barbería",
  fonda: "Fondita",
  abarrotes: "Abarrotera",
};
