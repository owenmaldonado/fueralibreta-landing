"use client";

import { Eye, UserCog, Ban, CheckCircle2, Trash2, MessageCircle } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { waLink } from "@/lib/mock";
import type { AdminNegocio } from "@/lib/admin-data";

const TIPO_LABEL: Record<AdminNegocio["tipo"], string> = {
  barberia: "Barbería",
  fonda: "Fonda",
  abarrotes: "Abarrotes",
};

interface OrgsTableProps {
  negocios: AdminNegocio[];
  onViewDetail: (negocio: AdminNegocio) => void;
  onChangeOwner: (negocio: AdminNegocio) => void;
  onToggleActive: (negocio: AdminNegocio) => void;
  onDeleteRequest: (negocio: AdminNegocio) => void;
}

export function OrgsTable({ negocios, onViewDetail, onChangeOwner, onToggleActive, onDeleteRequest }: OrgsTableProps) {
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
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {negocios.map((n) => {
          const items: DropdownItem[] = [
            { label: "Ver datos del negocio", icon: <Eye className="h-4 w-4" />, onClick: () => onViewDetail(n) },
            { label: "Cambiar owner", icon: <UserCog className="h-4 w-4" />, onClick: () => onChangeOwner(n) },
            {
              label: n.isActive ? "Pausar" : "Activar",
              icon: n.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />,
              onClick: () => onToggleActive(n),
            },
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
              <TableCell className="text-sm text-muted-foreground">1</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(n.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
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
