"use client";

import * as React from "react";
import { Search, ShieldAlert } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sampleAdminBusinesses, daysUntil } from "@/lib/mock";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types";

const TIPO_LABEL: Record<Business["tipo"], string> = {
  barberia: "Barbería",
  fonda: "Fonda",
  abarrotes: "Abarrotes",
};

export default function AdminPage() {
  const [negocios, setNegocios] = React.useState<Business[]>(() => sampleAdminBusinesses());
  const [q, setQ] = React.useState("");

  const filtrados = negocios.filter(
    (n) => n.nombre.toLowerCase().includes(q.toLowerCase()) || n.telefono.includes(q) || n.dueno.toLowerCase().includes(q.toLowerCase())
  );

  function toggleActivo(id: string) {
    setNegocios((prev) => prev.map((n) => (n.id === id ? { ...n, is_active: !n.is_active } : n)));
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Panel de administración</h1>
            <p className="text-xs text-muted-foreground">
              {negocios.filter((n) => n.is_active).length} activos · {negocios.length} en total
            </p>
          </div>
        </div>

        <div className="relative mt-6 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar negocio, dueño o teléfono..." className="pl-9" />
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[1.6fr_1fr_0.9fr_0.9fr_0.9fr_auto] gap-3 border-b border-border bg-surface px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:grid">
            <span>Negocio</span>
            <span>Teléfono</span>
            <span>Tipo</span>
            <span>Trial vence</span>
            <span>Estado</span>
            <span />
          </div>
          <div className="divide-y divide-border">
            {filtrados.map((n) => {
              const diasTrial = daysUntil(n.trial_fin);
              return (
                <div
                  key={n.id}
                  className="grid grid-cols-1 gap-2 px-4 py-4 sm:grid-cols-[1.6fr_1fr_0.9fr_0.9fr_0.9fr_auto] sm:items-center sm:gap-3"
                >
                  <div>
                    <p className="text-sm font-medium">{n.nombre}</p>
                    <p className="text-xs text-muted-foreground">{n.dueno}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{n.telefono}</span>
                  <Badge variant="outline" className="w-fit">
                    {TIPO_LABEL[n.tipo]}
                  </Badge>
                  <span className={cn("text-sm", diasTrial < 0 ? "text-destructive" : "text-muted-foreground")}>
                    {diasTrial < 0 ? `Venció hace ${Math.abs(diasTrial)}d` : `En ${diasTrial}d`}
                  </span>
                  <Badge variant={n.is_active ? "ledger" : "outline"} className="w-fit">
                    {n.is_active ? "Activo" : "Pausado"}
                  </Badge>
                  <Button size="sm" variant={n.is_active ? "outline" : "default"} onClick={() => toggleActivo(n.id)}>
                    {n.is_active ? "Pausar" : "Activar"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
