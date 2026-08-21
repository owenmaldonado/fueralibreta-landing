"use client";

import * as React from "react";
import { Award } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/mock";
import { PLAN_LABELS, PLAN_PRECIO_LISTA, planDeAcceso, precioReal, formatTrial, type PlanId } from "@/lib/planes";

export interface FacturaNegocio {
  id: string;
  plan: PlanId;
  trialInicio: string;
  trialFin: string;
  precioCustom: number | null;
  esFundador: boolean;
  notasAdmin: string | null;
  ultimoPagoAt: string | null;
}

/**
 * Sección tipo factura del "Ver detalles" de un negocio — la usan tanto
 * UserDetailDialog como NegocioDetailDialog para no tener dos copias del
 * mismo formulario. Plan contratado es de solo lectura aquí (se cambia
 * desde el menú ⋮ · Cambiar plan); todo lo demás se guarda junto con un
 * solo botón, salvo Fundador que aplica al toque como en el menú.
 */
export function NegocioBillingCard({
  negocio,
  onToggleFundador,
  onSaveFacturacion,
}: {
  negocio: FacturaNegocio;
  onToggleFundador: () => void;
  onSaveFacturacion: (
    negocioId: string,
    cambios: { precioCustom: number | null; trialInicio: string; trialFin: string; notasAdmin: string | null }
  ) => void;
}) {
  const [precio, setPrecio] = React.useState(String(precioReal(negocio)));
  const [trialInicio, setTrialInicio] = React.useState(negocio.trialInicio);
  const [trialFin, setTrialFin] = React.useState(negocio.trialFin);
  const [notas, setNotas] = React.useState(negocio.notasAdmin ?? "");

  React.useEffect(() => {
    setPrecio(String(precioReal(negocio)));
    setTrialInicio(negocio.trialInicio);
    setTrialFin(negocio.trialFin);
    setNotas(negocio.notasAdmin ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocio.id]);

  const planAcceso = planDeAcceso(negocio);
  const trial = formatTrial(negocio.trialFin);

  function guardar() {
    const n = Number(precio);
    onSaveFacturacion(negocio.id, {
      precioCustom: Number.isFinite(n) && n >= 0 ? n : precioReal(negocio),
      trialInicio,
      trialFin,
      notasAdmin: notas.trim() === "" ? null : notas,
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Facturación</p>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Plan contratado</p>
          <p className="font-medium">
            {PLAN_LABELS[negocio.plan]} · {formatMoney(PLAN_PRECIO_LISTA[negocio.plan])}/mes
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Plan con acceso</p>
          <p className="font-medium">
            {PLAN_LABELS[planAcceso]}
            {negocio.esFundador && <span className="text-primary"> (cortesía Fundador)</span>}
            {/* Trial PRO de cortesía (PR #122): nunca pagó, plan contratado > básico, activado a mano desde /admin ("Activar N días PRO") — no confundir con un cliente real que sí pagó ese plan. */}
            {!negocio.esFundador && !negocio.ultimoPagoAt && negocio.plan !== "basico" && (
              <span className="text-primary"> (prueba PRO{trial.vencido ? ", vencida" : `, ${trial.texto}`})</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Es Fundador</span>
          {negocio.esFundador && <Badge variant="outline" className="border-primary/40 text-primary">Sí</Badge>}
        </div>
        <Switch checked={negocio.esFundador} onCheckedChange={() => onToggleFundador()} />
      </div>

      <div className="space-y-1.5">
        <Label>Precio mensual congelado (MXN)</Label>
        <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Trial inicio</Label>
          <Input type="date" value={trialInicio} onChange={(e) => setTrialInicio(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>
            Trial fin{" "}
            <span className={trial.vencido ? "text-destructive" : "text-muted-foreground"}>· {trial.texto}</span>
          </Label>
          <Input type="date" value={trialFin} onChange={(e) => setTrialFin(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej. video testimonio 1 min pendiente"
          rows={2}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <Button size="sm" onClick={guardar} className="self-start">
        Guardar cambios
      </Button>
    </div>
  );
}
