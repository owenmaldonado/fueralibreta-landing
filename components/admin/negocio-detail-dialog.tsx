"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { fetchNegocioDetail, type AdminNegocio, type NegocioDetail } from "@/lib/admin-data";

export function NegocioDetailDialog({ negocio, onClose }: { negocio: AdminNegocio | null; onClose: () => void }) {
  const [loading, setLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<NegocioDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!negocio) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchNegocioDetail(negocio)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [negocio]);

  return (
    <Dialog open={!!negocio} onOpenChange={(o) => !o && onClose()} className="max-w-lg">
      <DialogHeader title={negocio?.nombre ?? "Negocio"} description={negocio?.ownerEmail ?? undefined} onClose={onClose} />
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-destructive">{error}</p>
      ) : detail ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="capitalize">
              {detail.tipo}
            </Badge>
            <Badge variant={detail.isActive ? "ledger" : "outline"}>{detail.isActive ? "Activo" : "Pausado"}</Badge>
          </div>
          <div className="flex gap-6 rounded-xl border border-border bg-surface p-4">
            {detail.stats.map((s) => (
              <div key={s.label}>
                <p className="font-display text-2xl font-bold">{s.value}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Creado el {new Date(detail.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })} · slug{" "}
            <span className="font-mono">{detail.slug}</span>
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
