"use client";

import { MessageCircle } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { EmptyState } from "@/components/dashboards/empty-state";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { formatMoney, todayISO, waLink } from "@/lib/mock";
import type { AppointmentStatus } from "@/lib/types";

const ESTADO_LABEL: Record<AppointmentStatus, string> = {
  pendiente: "No se marcó",
  listo: "Atendido",
  cancelada: "Cancelada",
};

const ESTADO_CLASS: Record<AppointmentStatus, string> = {
  pendiente: "text-muted-foreground",
  listo: "text-ledger",
  cancelada: "text-destructive",
};

export default function HistorialPage() {
  const { session, ready } = useSession();

  if (!ready || !session) return <LoadingBlock />;

  const data = session.barberia!;
  const hoy = todayISO(0);
  const pasadas = data.citas.filter((c) => c.fecha < hoy).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.hora.localeCompare(a.hora));

  const grupos = new Map<string, typeof pasadas>();
  for (const c of pasadas) {
    if (!grupos.has(c.fecha)) grupos.set(c.fecha, []);
    grupos.get(c.fecha)!.push(c);
  }

  return (
    <>
      <PageHeader title="Historial" subtitle="Citas de días anteriores" />
      <div className="flex flex-col gap-5 px-4 pb-6">
        {pasadas.length === 0 ? (
          <EmptyState texto="Todavía no tienes citas pasadas" />
        ) : (
          Array.from(grupos.entries()).map(([fecha, citas]) => (
            <div key={fecha}>
              <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" })}
              </p>
              <div className="flex flex-col gap-2">
                {citas.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <div className="w-14 shrink-0 font-mono text-sm text-muted-foreground">{c.hora}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.clienteNombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.servicioNombre} · {formatMoney(c.precio)}
                      </p>
                    </div>
                    <span className={cn("shrink-0 font-mono text-xs uppercase tracking-widest", ESTADO_CLASS[c.estado])}>
                      {ESTADO_LABEL[c.estado]}
                    </span>
                    {c.clienteTelefono && (
                      <a
                        href={waLink(c.clienteTelefono, `Hola ${c.clienteNombre}, ¿cuándo te agendamos tu próxima cita?`)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ledger hover:bg-secondary"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
