import { Gift, RefreshCcw, Ban, ShieldCheck, MessageCircle } from "lucide-react";

import { PLAN_ORDEN, PLAN_LABELS, BENEFICIOS_POR_GIRO } from "@/lib/planes";
import type { BusinessType } from "@/lib/types";

const PASOS = [
  'Eliges tu plan y picas "Activar Plan" — se abre WhatsApp con tu negocio, tipo, plan, precio e ID corto ya escritos.',
  "Te mando los datos de pago (transferencia o Mercado Pago) y lo activo a mano desde /admin en menos de 5 minutos, por 30 días.",
  "Se activa al instante y se desbloquea todo lo de tu plan.",
];

const POLITICA: { icon: typeof Gift; texto: string; bold?: boolean }[] = [
  { icon: RefreshCcw, texto: "Mensual, sin permanencia." },
  { icon: Gift, texto: "7 días gratis para probar." },
  { icon: Ban, texto: "Una vez activado el plan, NO hay reembolso.", bold: true },
  { icon: ShieldCheck, texto: "Si no renuevas, tu negocio se bloquea pero NO se borra nada. Pagas y vuelve todo intacto." },
  { icon: MessageCircle, texto: "Soporte directo por WhatsApp con el fundador." },
];

/** FAQ de cómo se paga + política de reembolso/bloqueo + comparativa rápida de planes — debajo de <PlanesCards> en /planes y /planes-bloqueado. La comparativa reusa BENEFICIOS_POR_GIRO (mismos datos que ya alimentan las cards) para no mantener una segunda tabla de "qué trae cada plan" a mano. */
export function PlanesInfo({ tipo }: { tipo: BusinessType }) {
  const beneficios = BENEFICIOS_POR_GIRO[tipo];

  return (
    <div className="mt-12 space-y-10">
      <section>
        <h2 className="text-center font-display text-lg font-bold tracking-tight">¿Cómo funciona el pago?</h2>
        <ol className="mt-4 space-y-3">
          {PASOS.map((paso, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5">{paso}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="text-center font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Qué desbloquea cada plan
        </h3>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {PLAN_ORDEN.map((plan) => (
                  <th key={plan} className="p-3 text-left font-display font-bold">
                    {PLAN_LABELS[plan]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {PLAN_ORDEN.map((plan) => (
                  <td key={plan} className="p-3 align-top text-xs text-muted-foreground">
                    {beneficios[plan].join(" · ")}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <ul className="mx-auto flex max-w-md flex-col gap-2">
        {POLITICA.map(({ icon: Icon, texto, bold }, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className={bold ? "font-semibold text-foreground" : undefined}>{texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
