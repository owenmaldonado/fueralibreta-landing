"use client";

import { Eye, UserCog, Crown, Clock, Tag, Award, Ban, CheckCircle2, Trash2 } from "lucide-react";

import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { PLAN_ORDEN, PLAN_LABELS, type PlanId } from "@/lib/planes";
import type { AdminNegocio, AdminProfile } from "@/lib/admin-data";

/**
 * Menú de ⋮ de admin, unificado: tanto la tabla de Usuarios como la de
 * Negocios arman la misma lista de 8 acciones a partir de este único
 * componente (cada tabla solo resuelve qué profile/negocio le toca a su
 * fila) — así nunca se desincronizan entre sí. Acciones de negocio (plan,
 * trial, precio custom, fundador) se ocultan si esta fila no tiene un
 * negocio resuelto; "Ver como usuario"/"Eliminar" se ocultan para ti mismo;
 * "Ver como usuario"/"Banear"/"Eliminar" se ocultan si no hay profile (negocio
 * huérfano, caso raro: owner_id tiene on delete cascade).
 */
export interface AdminActionsMenuProps {
  profile: AdminProfile | null;
  negocio: AdminNegocio | undefined;
  isSelf: boolean;
  onViewDetail: () => void;
  onImpersonate: () => void;
  onSetPlan: (plan: PlanId) => void;
  onSetTrial: (dias: 7 | 14 | 30) => void;
  /** Cambia el plan Y extiende trial_fin 30 días en un solo PATCH — el flujo real después de que el cliente confirma el pago por WhatsApp (antes eran dos clics separados: "Cambiar plan" + "Activar 30 días"). */
  onActivarPlan: (plan: PlanId) => void;
  onSetPrecioCustom: () => void;
  onToggleFundador: () => void;
  onToggleBanned: () => void;
  onDelete: () => void;
  className?: string;
}

export function AdminActionsMenu({
  profile,
  negocio,
  isSelf,
  onViewDetail,
  onImpersonate,
  onSetPlan,
  onSetTrial,
  onActivarPlan,
  onSetPrecioCustom,
  onToggleFundador,
  onToggleBanned,
  onDelete,
  className,
}: AdminActionsMenuProps) {
  const items: DropdownItem[] = [
    ...(profile && !isSelf
      ? [{ label: "Ver como usuario", icon: <UserCog className="h-4 w-4" />, onClick: onImpersonate }]
      : []),
    { label: "Ver detalles", icon: <Eye className="h-4 w-4" />, onClick: onViewDetail },
    ...(negocio
      ? [
          ...PLAN_ORDEN.filter((plan) => plan !== negocio.plan).map((plan) =>
            plan === "basico"
              ? {
                  label: `Bajar a ${PLAN_LABELS[plan]}`,
                  icon: <Crown className="h-4 w-4" />,
                  onClick: () => onSetPlan(plan),
                }
              : {
                  // Un solo clic tras confirmar el pago por WhatsApp: cambia
                  // el plan y extiende trial_fin 30 días a la vez.
                  label: `Activar ${PLAN_LABELS[plan]} (30 días)`,
                  icon: <Crown className="h-4 w-4" />,
                  onClick: () => onActivarPlan(plan),
                }
          ),
          { label: "Poner trial 7 días", icon: <Clock className="h-4 w-4" />, onClick: () => onSetTrial(7) },
          { label: "Poner trial 14 días", icon: <Clock className="h-4 w-4" />, onClick: () => onSetTrial(14) },
          { label: "Extender 30 días (mismo plan)", icon: <Clock className="h-4 w-4" />, onClick: () => onSetTrial(30) },
          { label: "Precio custom", icon: <Tag className="h-4 w-4" />, onClick: onSetPrecioCustom },
          {
            label: negocio.esFundador ? "Quitar Fundador" : "Marcar Fundador",
            icon: <Award className="h-4 w-4" />,
            onClick: onToggleFundador,
          },
        ]
      : []),
    ...(profile
      ? [
          {
            label: profile.isBanned ? "Activar" : "Banear",
            icon: profile.isBanned ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />,
            danger: !profile.isBanned,
            onClick: onToggleBanned,
          },
        ]
      : []),
    ...(!isSelf ? [{ label: "Eliminar", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: onDelete }] : []),
  ];

  return <DropdownMenu items={items} className={className} />;
}
