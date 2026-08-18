"use client";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { AdminConsentimiento } from "@/lib/admin-data";

interface ConsentimientosTableProps {
  consentimientos: AdminConsentimiento[];
}

/** Prueba legal de que alguien aceptó el banner de cookies — Owen la usa para acreditarlo ante Profeco/INAI si hace falta. */
export function ConsentimientosTable({ consentimientos }: ConsentimientosTableProps) {
  if (consentimientos.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Todavía no hay consentimientos registrados.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Negocio</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>User agent</TableHead>
          <TableHead>Términos</TableHead>
          <TableHead>Privacidad</TableHead>
          <TableHead>Cookies</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {consentimientos.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
              {new Date(c.createdAt).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </TableCell>
            <TableCell className="text-sm">{c.negocioNombre ?? "— (landing)"}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{c.ip ?? "—"}</TableCell>
            <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={c.userAgent ?? undefined}>
              {c.userAgent ?? "—"}
            </TableCell>
            <TableCell>
              <Badge variant={c.aceptoTerminos ? "ledger" : "outline"}>{c.aceptoTerminos ? "Sí" : "No"}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={c.aceptoPrivacidad ? "ledger" : "outline"}>{c.aceptoPrivacidad ? "Sí" : "No"}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={c.aceptoCookies ? "ledger" : "outline"}>{c.aceptoCookies ? "Sí" : "No"}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
