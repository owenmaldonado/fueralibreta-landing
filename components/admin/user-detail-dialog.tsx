"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { fetchUserDetail, type AdminProfile, type UserDetailNegocio } from "@/lib/admin-data";

export function UserDetailDialog({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [loading, setLoading] = React.useState(false);
  const [profile, setProfile] = React.useState<AdminProfile | null>(null);
  const [negocios, setNegocios] = React.useState<UserDetailNegocio[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUserDetail(userId)
      .then((result) => {
        if (cancelled) return;
        setProfile(result.profile);
        setNegocios(result.negocios);
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
  }, [userId]);

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()} className="max-w-xl">
      <DialogHeader title="Detalle de usuario" onClose={onClose} />
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-destructive">{error}</p>
      ) : profile ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Avatar src={profile.avatarUrl} label={profile.email ?? "?"} className="h-12 w-12 text-base" />
            <div>
              <p className="font-medium">{profile.email ?? "Sin email"}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant={profile.role === "admin" ? "default" : "outline"}>{profile.role}</Badge>
                <Badge variant={profile.plan === "pro" ? "ledger" : "outline"}>{profile.plan}</Badge>
                {profile.isBanned && (
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    Baneado
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Negocios · {negocios.length}
            </p>
            {negocios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no tiene ningún negocio.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {negocios.map((n) => (
                  <div key={n.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{n.nombre}</p>
                      <Badge variant={n.isActive ? "ledger" : "outline"}>{n.isActive ? "Activo" : "Pausado"}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">{n.tipo}</p>
                    <div className="mt-2 flex gap-4">
                      {n.stats.map((s) => (
                        <div key={s.label}>
                          <p className="font-display text-lg font-bold">{s.value}</p>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
