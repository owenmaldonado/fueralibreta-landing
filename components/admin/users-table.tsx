"use client";

import * as React from "react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AdminActionsMenu } from "./admin-actions-menu";
import type { AdminProfile, AdminNegocio } from "@/lib/admin-data";
import type { PlanId } from "@/lib/planes";
import { cn } from "@/lib/utils";

interface UsersTableProps {
  profiles: AdminProfile[];
  negocios: AdminNegocio[];
  currentUserId: string;
  onViewDetail: (userId: string) => void;
  /** Cambia el plan (básico/pro/pro_plus) del negocio de este usuario — no profiles.plan, ver lib/planes.ts. */
  onSetPlan: (profile: AdminProfile, plan: PlanId) => void;
  onSetTrial: (profile: AdminProfile, dias: 7 | 14) => void;
  onSetPrecioCustom: (profile: AdminProfile) => void;
  onToggleFundador: (profile: AdminProfile) => void;
  onToggleBanned: (profile: AdminProfile) => void;
  onImpersonate: (profile: AdminProfile) => void;
  onDeleteRequest: (profile: AdminProfile) => void;
}

export function UsersTable({
  profiles,
  negocios,
  currentUserId,
  onViewDetail,
  onSetPlan,
  onSetTrial,
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
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin usuarios que coincidan con el filtro.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Usuario</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead className="text-center">Negocios</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Registro</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {profiles.map((p) => {
          const isSelf = p.id === currentUserId;
          const negocio = negocioPorOwner.get(p.id);

          return (
            <TableRow key={p.id}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Avatar src={p.avatarUrl} label={p.email ?? "?"} />
                  <div className="min-w-0">
                    <p className="max-w-[200px] truncate text-sm font-medium">{p.email ?? "Sin email"}</p>
                    {isSelf && <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Tú</p>}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={p.role === "admin" ? "default" : "outline"}>{p.role === "admin" ? "Admin" : "User"}</Badge>
              </TableCell>
              <TableCell className="text-center font-mono text-sm">{p.negociosCount}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={p.plan === "pro" ? "ledger" : "outline"}>{p.plan}</Badge>
                  {negocio?.esFundador && (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      Fundador
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(p.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                    p.isBanned ? "bg-destructive/15 text-destructive" : "bg-ledger/15 text-ledger"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", p.isBanned ? "bg-destructive" : "bg-ledger")} />
                  {p.isBanned ? "Baneado" : "Activo"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <AdminActionsMenu
                  profile={p}
                  negocio={negocio}
                  isSelf={isSelf}
                  onViewDetail={() => onViewDetail(p.id)}
                  onImpersonate={() => onImpersonate(p)}
                  onSetPlan={(plan) => onSetPlan(p, plan)}
                  onSetTrial={(dias) => onSetTrial(p, dias)}
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
