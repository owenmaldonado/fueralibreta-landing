"use client";

import { Eye, ShieldCheck, ShieldOff, Ban, CheckCircle2, UserCog, Trash2, Crown } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import type { AdminProfile } from "@/lib/admin-data";
import { PLAN_ORDEN, PLAN_LABELS, type PlanId } from "@/lib/planes";
import { cn } from "@/lib/utils";

interface UsersTableProps {
  profiles: AdminProfile[];
  currentUserId: string;
  onViewDetail: (userId: string) => void;
  onToggleRole: (profile: AdminProfile) => void;
  /** Cambia el plan (básico/pro/pro_plus) del negocio de este usuario — no profiles.plan, ver lib/planes.ts. */
  onSetPlan: (profile: AdminProfile, plan: PlanId) => void;
  onToggleBanned: (profile: AdminProfile) => void;
  onImpersonate: (profile: AdminProfile) => void;
  onDeleteRequest: (profile: AdminProfile) => void;
}

export function UsersTable({
  profiles,
  currentUserId,
  onViewDetail,
  onToggleRole,
  onSetPlan,
  onToggleBanned,
  onImpersonate,
  onDeleteRequest,
}: UsersTableProps) {
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
          const items: DropdownItem[] = [
            { label: "Ver detalles", icon: <Eye className="h-4 w-4" />, onClick: () => onViewDetail(p.id) },
            {
              label: p.role === "admin" ? "Quitar admin" : "Hacer admin",
              icon: p.role === "admin" ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />,
              onClick: () => onToggleRole(p),
            },
            ...(p.negociosCount > 0
              ? PLAN_ORDEN.map((plan) => ({
                  label: `Cambiar plan: ${PLAN_LABELS[plan]}`,
                  icon: <Crown className="h-4 w-4" />,
                  onClick: () => onSetPlan(p, plan),
                }))
              : []),
            {
              label: p.isBanned ? "Desbanear" : "Banear",
              icon: p.isBanned ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />,
              danger: !p.isBanned,
              onClick: () => onToggleBanned(p),
            },
            ...(!isSelf
              ? [
                  {
                    label: "Ver como este usuario",
                    icon: <UserCog className="h-4 w-4" />,
                    onClick: () => onImpersonate(p),
                  },
                  {
                    label: "Eliminar usuario",
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    onClick: () => onDeleteRequest(p),
                  },
                ]
              : []),
          ];

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
                <Badge variant={p.plan === "pro" ? "ledger" : "outline"}>{p.plan}</Badge>
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
                <DropdownMenu items={items} className="ml-auto" />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
