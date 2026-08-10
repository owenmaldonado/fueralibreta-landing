"use client";

import { Eye, UserCog, Ban, CheckCircle2, Trash2, MessageCircle, ArrowUpCircle } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { waLink } from "@/lib/mock";
import { estadoEfectivo } from "@/lib/planes";
import type { AdminNegocio } from "@/lib/admin-data";
import type { PlanNegocio, EstadoNegocio } from "@/lib/types";

const TIPO_LABEL: Record<AdminNegocio["tipo"], string> = {
  barberia: "Barbería",
  fonda: "Fonda",
  abarrotes: "Abarrotes",
};

const PLAN_LABEL: Record<PlanNegocio, string> = {
  basico: "Básico",
  pro: "Pro",
  pro_plus: "Pro+",
};

const ESTADO_LABEL: Record<EstadoNegocio, string> = {
  prueba: "Prueba",
  activo: "Activo",
  suspendido: "Suspendido",
};

/** basico -> pro -> pro_plus -> basico, para el item "Subir/Bajar plan" del menú de acciones. */
function siguientePlan(actual: PlanNegocio): PlanNegocio {
  if (actual === "basico") return "pro";
  if (actual === "pro") return "pro_plus";
  return "basico";
}

interface OrgsTableProps {
  negocios: AdminNegocio[];
  onViewDetail: (negocio: AdminNegocio) => void;
  onChangeOwner: (negocio: AdminNegocio) => void;
  onToggleActive: (negocio: AdminNegocio) => void;
  onChangePlan: (negocio: AdminNegocio, plan: PlanNegocio) => void;
  onChangeEstado: (negocio: AdminNegocio, estado: EstadoNegocio) => void;
  onDeleteRequest: (negocio: AdminNegocio) => void;
}

export function OrgsTable({
  negocios,
  onViewDetail,
  onChangeOwner,
  onToggleActive,
  onChangePlan,
  onChangeEstado,
  onDeleteRequest,
}: OrgsTableProps) {
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
          <TableHead>Creado</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Facturación</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {negocios.map((n) => {
          const estado = estadoEfectivo(n);
          const proximoPlan = siguientePlan(n.plan);
          const items: DropdownItem[] = [
            { label: "Ver datos del negocio", icon: <Eye className="h-4 w-4" />, onClick: () => onViewDetail(n) },
            { label: "Cambiar owner", icon: <UserCog className="h-4 w-4" />, onClick: () => onChangeOwner(n) },
            {
              label: n.isActive ? "Pausar" : "Activar",
              icon: n.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />,
              onClick: () => onToggleActive(n),
            },
            {
              label: proximoPlan === "basico" ? `Bajar a ${PLAN_LABEL[proximoPlan]}` : `Subir a ${PLAN_LABEL[proximoPlan]}`,
              icon: <ArrowUpCircle className="h-4 w-4" />,
              onClick: () => onChangePlan(n, proximoPlan),
            },
            estado === "suspendido"
              ? { label: "Marcar como pagado (activo)", icon: <CheckCircle2 className="h-4 w-4" />, onClick: () => onChangeEstado(n, "activo") }
              : { label: "Suspender por impago", icon: <Ban className="h-4 w-4" />, danger: true, onClick: () => onChangeEstado(n, "suspendido") },
            { label: "Eliminar negocio", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => onDeleteRequest(n) },
          ];

          return (
            <TableRow key={n.id}>
              <TableCell>
                <p className="max-w-[220px] truncate text-sm font-medium">{n.nombre}</p>
                <p className="font-mono text-xs text-muted-foreground">{TIPO_LABEL[n.tipo]}</p>
              </TableCell>
              <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{n.ownerEmail ?? "—"}</TableCell>
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
              <TableCell className="text-sm text-muted-foreground">
                {new Date(n.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
              </TableCell>
              <TableCell>
                <Badge variant={n.plan === "pro_plus" ? "ledger" : n.plan === "pro" ? "default" : "outline"}>
                  {PLAN_LABEL[n.plan]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={estado === "activo" ? "ledger" : estado === "prueba" ? "default" : "outline"}>
                  {ESTADO_LABEL[estado]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={n.isActive ? "ledger" : "outline"}>{n.isActive ? "Activo" : "Pausado"}</Badge>
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
