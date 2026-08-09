"use client";

import { MessageCircle, CheckCircle2, ArrowRightCircle } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { waLink } from "@/lib/mock";
import type { AdminLead, LeadEstado } from "@/lib/admin-data";

const TIPO_LABEL: Record<AdminLead["tipoNegocio"], string> = {
  fonda: "Fondita",
  abarrotes: "Abarrotera",
  barberia: "Barbería",
  otro: "Otro",
};

const ESTADO_LABEL: Record<LeadEstado, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  convertido: "Convertido",
};

const ESTADO_VARIANT: Record<LeadEstado, "default" | "ledger" | "outline"> = {
  nuevo: "default",
  contactado: "outline",
  convertido: "ledger",
};

interface LeadsTableProps {
  leads: AdminLead[];
  onMarkContactado: (lead: AdminLead) => void;
  onConvertir: (lead: AdminLead) => void;
}

export function LeadsTable({ leads, onMarkContactado, onConvertir }: LeadsTableProps) {
  if (leads.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin leads que coincidan con el filtro.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>WhatsApp</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Mensaje</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const mensajePrecargado = `Hola ${lead.nombre}, te escribo de Fuera Libreta por tu mensaje, ¿seguimos platicando por aquí?`;
          const items: DropdownItem[] = [
            { label: "Marcar contactado", icon: <CheckCircle2 className="h-4 w-4" />, onClick: () => onMarkContactado(lead) },
            {
              label: "WhatsApp",
              icon: <MessageCircle className="h-4 w-4" />,
              onClick: () => window.open(waLink(lead.whatsapp, mensajePrecargado), "_blank", "noopener,noreferrer"),
            },
            { label: "Convertir a negocio", icon: <ArrowRightCircle className="h-4 w-4" />, onClick: () => onConvertir(lead) },
          ];

          return (
            <TableRow key={lead.id}>
              <TableCell className="max-w-[160px] truncate text-sm font-medium">{lead.nombre}</TableCell>
              <TableCell>
                <a
                  href={waLink(lead.whatsapp, mensajePrecargado)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sm text-primary hover:underline"
                >
                  {lead.whatsapp}
                </a>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{TIPO_LABEL[lead.tipoNegocio]}</Badge>
              </TableCell>
              <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{lead.mensaje || "—"}</TableCell>
              <TableCell>
                <Badge variant={ESTADO_VARIANT[lead.estado]}>{ESTADO_LABEL[lead.estado]}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(lead.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
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
