"use client";

import * as React from "react";
import { MessageCircle, MoreVertical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { waLink, formatMoney } from "@/lib/mock";
import type { AdminNegocio, AdminProfile } from "@/lib/admin-data";
import {
  PLAN_LABELS,
  formatTrial,
  estadoNegocio,
  estadoCobranza,
  mensajeRecordatorioCobranza,
  type PlanId,
} from "@/lib/planes";

const TIPO_LABEL: Record<AdminNegocio["tipo"], string> = {
  barberia: "Barbería",
  fonda: "Fonda",
  abarrotes: "Abarrotes",
};

const PLAN_BADGE_VARIANT: Record<PlanId, "outline" | "default" | "ledger"> = {
  basico: "outline",
  pro: "default",
  pro_plus: "ledger",
};

const ESTADO_DOT: Record<"activo" | "por_vencer" | "bloqueado", string> = {
  activo: "bg-ledger",
  por_vencer: "bg-primary",
  bloqueado: "bg-destructive",
};

function formatUltimoPago(iso: string | null): string {
  if (!iso) return "Nunca";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Hace 1 día";
  return `Hace ${dias} días`;
}

interface OrgsGridProps {
  negocios: AdminNegocio[];
  profiles: AdminProfile[];
  currentUserId: string;
  onViewDetail: (negocio: AdminNegocio) => void;
  onImpersonate: (profile: AdminProfile) => void;
  onSetPlan: (negocio: AdminNegocio, plan: PlanId) => void;
  onSetTrial: (negocio: AdminNegocio, dias: 7 | 14 | 30) => void;
  onActivarPlan: (negocio: AdminNegocio, plan: PlanId) => void;
  onSetPrecioCustom: (negocio: AdminNegocio) => void;
  onToggleFundador: (negocio: AdminNegocio) => void;
  onToggleBanned: (profile: AdminProfile) => void;
  onDeleteRequest: (negocio: AdminNegocio) => void;
}

export function OrgsGrid({
  negocios,
  profiles,
  currentUserId,
  onViewDetail,
  onImpersonate,
  onSetPlan,
  onSetTrial,
  onActivarPlan,
  onSetPrecioCustom,
  onToggleFundador,
  onToggleBanned,
  onDeleteRequest,
}: OrgsGridProps) {
  const profilePorId = React.useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  if (negocios.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin negocios que coincidan con el filtro.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {negocios.map((n) => {
        const profile = n.ownerId ? (profilePorId.get(n.ownerId) ?? null) : null;
        const isSelf = n.ownerId === currentUserId;
        const cobranza = estadoCobranza(n);
        const estado = estadoNegocio({ trialFin: n.trialFin, esFundador: n.esFundador, isActive: n.isActive, ultimoPagoAt: n.ultimoPagoAt });

        return (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            onClick={() => onViewDetail(n)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onViewDetail(n);
              }
            }}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/50 hover:bg-secondary/30 transition-colors cursor-pointer">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base truncate">{n.nombre}</p>
                <p className="text-xs text-muted-foreground capitalize">{TIPO_LABEL[n.tipo]}</p>
              </div>
              <Badge variant={n.isActive ? "ledger" : "outline"} className="shrink-0">
                {n.isActive ? "Activo" : "Pausado"}
              </Badge>
            </div>

            {/* Ingresos destacado */}
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ingresos totales</p>
              <p className="font-display text-2xl font-bold text-ledger">{formatMoney(n.ingresosTotales)}</p>
            </div>

            {/* Plan y estado */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={PLAN_BADGE_VARIANT[n.plan]} className="text-xs">
                {PLAN_LABELS[n.plan]}
              </Badge>
              {n.esFundador && (
                <Badge variant="outline" className="border-primary/40 text-primary text-xs">
                  Fundador
                </Badge>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                <span className={`h-2 w-2 shrink-0 rounded-full ${ESTADO_DOT[estado]}`} />
                {n.esFundador ? "Fundador" : formatTrial(n.trialFin).texto}
              </div>
            </div>

            {/* Owner */}
            {!isSelf && (
              <div className="text-xs text-muted-foreground border-t border-border pt-2">
                <p className="truncate">{n.ownerEmail ?? "—"}</p>
              </div>
            )}

            {/* Datos */}
            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground border-t border-border pt-2">
              <div>
                <p className="uppercase tracking-widest text-[9px]">Último pago</p>
                <p className="font-mono">{formatUltimoPago(n.ultimoPagoAt)}</p>
              </div>
              <div>
                <p className="uppercase tracking-widest text-[9px]">Creado</p>
                <p className="font-mono">
                  {new Date(n.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                </p>
              </div>
            </div>

            {/* Acción rápida: WhatsApp */}
            {n.ownerPhone && (
              <div className="border-t border-border pt-2 mt-1">
                <Button asChild variant="outline" size="sm" className="w-full text-xs h-8" onClick={(e) => e.stopPropagation()}>
                  <a href={waLink(n.ownerPhone, `Hola, te escribo de Fuera Libreta sobre ${n.nombre}.`)} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
