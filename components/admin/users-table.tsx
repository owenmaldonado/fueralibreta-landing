"use client";

import * as React from "react";
import { MessageCircle, MoreHorizontal } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminProfile, AdminNegocio } from "@/lib/admin-data";
import { PLAN_LABELS, planDeAcceso, precioReal, formatTrial } from "@/lib/planes";
import { formatMoney, waLink } from "@/lib/mock";
import { cn } from "@/lib/utils";

interface UsersTableProps {
  profiles: AdminProfile[];
  negocios: AdminNegocio[];
  currentUserId: string;
  onViewDetail: (userId: string) => void;
}

/**
 * Lista vertical de cards (reemplaza la tabla de 10 columnas) — mismo dato
 * por usuario que antes, solo que apilado en vez de en fila: sin
 * overflow-x, sin overflow-y doble, solo el scroll natural de la página.
 * Toda acción (WhatsApp aparte, que ya es un link de un toque) vive ahora
 * en el modal de detalle (UserDetailDialog) con botones grandes en vez de
 * un menú ⋮ — tocar la card entera o el "..." abren el mismo modal.
 */
export function UsersTable({ profiles, negocios, currentUserId, onViewDetail }: UsersTableProps) {
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
    <div className="flex flex-col gap-3">
      {profiles.map((p) => {
        const isSelf = p.id === currentUserId;
        const negocio = negocioPorOwner.get(p.id);
        const planAcceso = negocio ? planDeAcceso(negocio.plan, negocio.esFundador) : null;
        const trial = negocio ? formatTrial(negocio.trialFin) : null;

        return (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => onViewDetail(p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onViewDetail(p.id);
              }
            }}
            className="flex cursor-pointer items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/50 sm:p-5"
          >
            <Avatar src={p.avatarUrl} label={p.email ?? "?"} className="h-11 w-11 shrink-0 text-base" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="truncate text-sm font-semibold">{p.email ?? "Sin email"}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  · {new Date(p.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                {isSelf && <span className="text-[10px] font-mono uppercase tracking-widest text-primary">Tú</span>}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {negocio?.ownerPhone ? (
                  <a
                    href={waLink(negocio.ownerPhone, `Hola, te escribo de Fuera Libreta sobre ${negocio.nombre}.`)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ledger px-3 py-1 text-xs font-semibold text-ledger-foreground transition-colors hover:bg-ledger/90"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {negocio.ownerPhone}
                  </a>
                ) : (
                  <span className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground">
                    Sin WhatsApp
                  </span>
                )}

                <Badge variant={p.role === "admin" ? "default" : "outline"}>{p.role === "admin" ? "Admin" : "User"}</Badge>

                <Badge variant="outline">{p.negociosCount} Negocio{p.negociosCount === 1 ? "" : "s"}</Badge>

                {negocio ? (
                  <Badge variant={negocio.esFundador ? "ledger" : "default"}>
                    {PLAN_LABELS[planAcceso!]} · {formatMoney(precioReal(negocio))}/mes
                  </Badge>
                ) : (
                  <Badge variant="outline">Sin negocio</Badge>
                )}

                {trial && (
                  <Badge variant="outline" className={trial.vencido ? "border-destructive/40 text-destructive" : undefined}>
                    {trial.texto}
                  </Badge>
                )}

                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                    p.isBanned ? "bg-destructive/15 text-destructive" : "bg-ledger/15 text-ledger"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", p.isBanned ? "bg-destructive" : "bg-ledger")} />
                  {p.isBanned ? "Baneado" : "Activo"}
                </span>
              </div>
            </div>

            <span
              aria-label="Ver detalle"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <MoreHorizontal className="h-5 w-5" />
            </span>
          </div>
        );
      })}
    </div>
  );
}
