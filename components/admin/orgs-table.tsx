"use client";

import * as React from "react";
import { MessageCircle, Copy, Check } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminActionsMenu } from "./admin-actions-menu";
import { waLink } from "@/lib/mock";
import type { AdminNegocio, AdminProfile } from "@/lib/admin-data";
import {
  PLAN_LABELS,
  formatTrial,
  estadoNegocio,
  estadoCobranza,
  mensajeRecordatorioCobranza,
  type PlanId,
  type EstadoNegocio,
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

const ESTADO_DOT: Record<EstadoNegocio, string> = {
  activo: "bg-ledger",
  por_vencer: "bg-primary",
  bloqueado: "bg-destructive",
};

/** "Hoy" / "Hace 1 día" / "Hace N días" — o "—" si nunca se registró un pago (ver ultimoPagoAt en lib/admin-data.ts). */
function formatUltimoPago(iso: string | null): string {
  if (!iso) return "—";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Hace 1 día";
  return `Hace ${dias} días`;
}

/** Primeros 8 caracteres del UUID + botón para copiar el ID completo — para pegarlo en el buscador o compartirlo sin tener que seleccionar el UUID entero a mano. */
function IdCorto({ id }: { id: string }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(id).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1200);
        });
      }}
      className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
      title={id}
    >
      {id.slice(0, 8)}
      {copiado ? <Check className="h-3 w-3 text-ledger" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

interface OrgsTableProps {
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

export function OrgsTable({
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
          <TableHead>Vence</TableHead>
          <TableHead>Último pago</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {negocios.map((n) => {
          const profile = n.ownerId ? (profilePorId.get(n.ownerId) ?? null) : null;
          const isSelf = n.ownerId === currentUserId;
          const cobranza = estadoCobranza(n);

          return (
            <TableRow key={n.id}>
              <TableCell>
                <p className="max-w-[220px] truncate text-sm font-medium">{n.nombre}</p>
                <p className="font-mono text-xs text-muted-foreground">{TIPO_LABEL[n.tipo]}</p>
                <IdCorto id={n.id} />
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
                <div className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ESTADO_DOT[estadoNegocio({ trialFin: n.trialFin, esFundador: n.esFundador, isActive: n.isActive })]}`} />
                  {n.esFundador ? "Fundador" : formatTrial(n.trialFin).texto}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatUltimoPago(n.ultimoPagoAt)}</TableCell>
              <TableCell>
                <Badge variant={n.isActive ? "ledger" : "outline"}>{n.isActive ? "Activo" : "Pausado"}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {(cobranza === "vencido" || cobranza === "por_vencer") && n.ownerPhone && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5 whitespace-nowrap">
                      <a href={waLink(n.ownerPhone, mensajeRecordatorioCobranza(n))} target="_blank" rel="noreferrer">
                        <MessageCircle className="h-3.5 w-3.5" /> Recordatorio
                      </a>
                    </Button>
                  )}
                  <AdminActionsMenu
                    profile={profile}
                    negocio={n}
                    isSelf={isSelf}
                    onViewDetail={() => onViewDetail(n)}
                    onImpersonate={() => profile && onImpersonate(profile)}
                    onSetPlan={(plan) => onSetPlan(n, plan)}
                    onSetTrial={(dias) => onSetTrial(n, dias)}
                    onActivarPlan={(plan) => onActivarPlan(n, plan)}
                    onSetPrecioCustom={() => onSetPrecioCustom(n)}
                    onToggleFundador={() => onToggleFundador(n)}
                    onToggleBanned={() => profile && onToggleBanned(profile)}
                    onDelete={() => onDeleteRequest(n)}
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
