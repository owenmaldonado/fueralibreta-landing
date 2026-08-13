"use client";

import * as React from "react";
import { MessageCircle } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AdminActionsMenu } from "./admin-actions-menu";
import { waLink } from "@/lib/mock";
import type { AdminNegocio, AdminProfile } from "@/lib/admin-data";
import { PLAN_LABELS, type PlanId } from "@/lib/planes";

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

interface OrgsTableProps {
  negocios: AdminNegocio[];
  profiles: AdminProfile[];
  currentUserId: string;
  onViewDetail: (negocio: AdminNegocio) => void;
  onImpersonate: (profile: AdminProfile) => void;
  onSetPlan: (negocio: AdminNegocio, plan: PlanId) => void;
  onSetTrial: (negocio: AdminNegocio, dias: 7 | 14) => void;
  onSetPrecioCustom: (negocio: AdminNegocio) => void;
  onToggleFundador: (negocio: AdminNegocio) => void;
  onToggleBanned: (profile: AdminProfile) => void;
  onDeleteRequest: (negocio: AdminNegocio) => void;
}

export function OrgsTable({
  negocios,
  profiles,
  currentUserId,
  onViewDetail,
  onImpersonate,
  onSetPlan,
  onSetTrial,
  onSetPrecioCustom,
  onToggleFundador,
  onToggleBanned,
  onDeleteRequest,
}: OrgsTableProps) {
  const profilePorId = React.useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  if (negocios.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin negocios que coincidan con el filtro.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Negocio</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>WhatsApp</TableHead>
          <TableHead>Miembros</TableHead>
          <TableHead>Creado</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {negocios.map((n) => {
          const profile = n.ownerId ? (profilePorId.get(n.ownerId) ?? null) : null;
          const isSelf = n.ownerId === currentUserId;

          return (
            <TableRow key={n.id}>
              <TableCell>
                <p className="max-w-[220px] truncate text-sm font-medium">{n.nombre}</p>
                <p className="font-mono text-xs text-muted-foreground">{TIPO_LABEL[n.tipo]}</p>
              </TableCell>
              <TableCell className="max-w-[200px] text-sm text-muted-foreground">
                <span className="truncate">{n.ownerEmail ?? "—"}</span>
                {isSelf && <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest text-primary">Tú</span>}
              </TableCell>
              <TableCell>
                {n.ownerPhone ? (
                  <a
                    href={waLink(n.ownerPhone, `Hola, te escribo de Fuera Libreta sobre ${n.nombre}.`)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 font-mono text-sm text-primary hover:underline"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {n.ownerPhone}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">1</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(n.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={PLAN_BADGE_VARIANT[n.plan]}>{PLAN_LABELS[n.plan]}</Badge>
                  {n.esFundador && (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      Fundador
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={n.isActive ? "ledger" : "outline"}>{n.isActive ? "Activo" : "Pausado"}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <AdminActionsMenu
                  profile={profile}
                  negocio={n}
                  isSelf={isSelf}
                  onViewDetail={() => onViewDetail(n)}
                  onImpersonate={() => profile && onImpersonate(profile)}
                  onSetPlan={(plan) => onSetPlan(n, plan)}
                  onSetTrial={(dias) => onSetTrial(n, dias)}
                  onSetPrecioCustom={() => onSetPrecioCustom(n)}
                  onToggleFundador={() => onToggleFundador(n)}
                  onToggleBanned={() => profile && onToggleBanned(profile)}
                  onDelete={() => onDeleteRequest(n)}
                  className="ml-auto"
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
