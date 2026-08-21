"use client";

import * as React from "react";
import { MessageCircle } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminActionsMenu } from "./admin-actions-menu";
import type { AdminProfile, AdminNegocio } from "@/lib/admin-data";
import { PLAN_LABELS, planDeAcceso, precioReal, formatTrial, type PlanId } from "@/lib/planes";
import { formatMoney, waLink } from "@/lib/mock";
import { cn } from "@/lib/utils";

interface UsersTableProps {
  profiles: AdminProfile[];
  negocios: AdminNegocio[];
  currentUserId: string;
  onViewDetail: (userId: string) => void;
  /** Cambia el plan (básico/pro/pro_plus) del negocio de este usuario — no profiles.plan, ver lib/planes.ts. */
  onSetPlan: (profile: AdminProfile, plan: PlanId) => void;
  onSetTrial: (profile: AdminProfile, dias: 7 | 14 | 30) => void;
  onActivarPlan: (profile: AdminProfile, plan: PlanId) => void;
  onSetPrecioCustom: (profile: AdminProfile) => void;
  onToggleFundador: (profile: AdminProfile) => void;
  onToggleBanned: (profile: AdminProfile) => void;
  onImpersonate: (profile: AdminProfile) => void;
  onDeleteRequest: (profile: AdminProfile) => void;
}

// Mismas 10 columnas de siempre, solo más aire (py-5) y badges con más
// carácter — nada de info se movió a un modal ni se quitó.
const CELL = "py-5";

export function UsersTable({
  profiles,
  negocios,
  currentUserId,
  onViewDetail,
  onSetPlan,
  onSetTrial,
  onActivarPlan,
  onSetPrecioCustom,
  onToggleFundador,
  onToggleBanned,
  onImpersonate,
  onDeleteRequest,
}: UsersTableProps) {
  const negocioPorOwner = React.useMemo(() => {
    const map = new Map<string, AdminNegocio>();
    for (const n of negocios) {
      if (n.ownerId && !map.has(n.ownerId)) map.set(n.ownerId, n);
    }
    return map;
  }, [negocios]);

  if (profiles.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No hay clientes aún.</p>;
  }

  return (
    <Table className="min-w-[1360px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="py-3">Usuario</TableHead>
          <TableHead className="py-3">WhatsApp</TableHead>
          <TableHead className="py-3">Rol</TableHead>
          <TableHead className="py-3 text-center">Negocios</TableHead>
          <TableHead className="py-3">Plan contratado</TableHead>
          <TableHead className="py-3">Plan de acceso</TableHead>
          <TableHead className="py-3">Precio real</TableHead>
          <TableHead className="py-3">Trial</TableHead>
          <TableHead className="py-3">Registro</TableHead>
          <TableHead className="py-3">Estado</TableHead>
          <TableHead className="py-3 text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {profiles.map((p) => {
          const isSelf = p.id === currentUserId;
          const negocio = negocioPorOwner.get(p.id);
          const planAcceso = negocio ? planDeAcceso(negocio.plan, negocio.esFundador) : null;
          const trial = negocio ? formatTrial(negocio.trialFin) : null;

          return (
            <TableRow key={p.id} className="hover:bg-secondary/50">
              <TableCell className={CELL}>
                <div className="flex items-center gap-3">
                  <Avatar src={p.avatarUrl} label={p.email ?? "?"} />
                  <div className="min-w-0">
                    <p className="max-w-[200px] truncate text-sm font-semibold">{p.email ?? "Sin email"}</p>
                    <div className="flex gap-1.5">
                      {isSelf && <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Tú</p>}
                      {negocio?.esFundador && (
                        <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Fundador</p>
                      )}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className={CELL}>
                {negocio?.ownerPhone ? (
                  <Button asChild size="sm" variant="ledger" className="rounded-full">
                    <a href={waLink(negocio.ownerPhone, `Hola, te escribo de Fuera Libreta sobre ${negocio.nombre}.`)} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-3.5 w-3.5" /> {negocio.ownerPhone}
                    </a>
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">Sin WhatsApp</span>
                )}
              </TableCell>
              <TableCell className={CELL}>
                <Badge variant={p.role === "admin" ? "default" : "outline"}>{p.role === "admin" ? "Admin" : "User"}</Badge>
              </TableCell>
              <TableCell className={cn(CELL, "text-center font-mono text-sm")}>{p.negociosCount}</TableCell>
              <TableCell className={CELL}>
                {negocio ? <Badge variant="default">{PLAN_LABELS[negocio.plan]}</Badge> : <span className="text-sm text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className={CELL}>
                {planAcceso ? (
                  <Badge variant={negocio?.esFundador ? "ledger" : "default"}>{PLAN_LABELS[planAcceso]}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className={cn(CELL, "font-mono text-sm")}>
                {negocio ? `${formatMoney(precioReal(negocio))}/mes` : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className={cn(CELL, "text-sm")}>
                {trial ? (
                  <span className={trial.vencido ? "font-medium text-destructive" : "text-foreground"}>{trial.texto}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className={cn(CELL, "text-sm text-muted-foreground")}>
                {new Date(p.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
              </TableCell>
              <TableCell className={CELL}>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                    p.isBanned ? "bg-destructive/15 text-destructive" : "bg-ledger/15 text-ledger"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", p.isBanned ? "bg-destructive" : "bg-ledger")} />
                  {p.isBanned ? "Baneado" : "Activo"}
                </span>
              </TableCell>
              <TableCell className={cn(CELL, "text-right")}>
                <AdminActionsMenu
                  profile={p}
                  negocio={negocio}
                  isSelf={isSelf}
                  onViewDetail={() => onViewDetail(p.id)}
                  onImpersonate={() => onImpersonate(p)}
                  onSetPlan={(plan) => onSetPlan(p, plan)}
                  onSetTrial={(dias) => onSetTrial(p, dias)}
                  onActivarPlan={(plan) => onActivarPlan(p, plan)}
                  onSetPrecioCustom={() => onSetPrecioCustom(p)}
                  onToggleFundador={() => onToggleFundador(p)}
                  onToggleBanned={() => onToggleBanned(p)}
                  onDelete={() => onDeleteRequest(p)}
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
