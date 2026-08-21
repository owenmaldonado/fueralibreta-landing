"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  ShieldOff,
  UserCog,
  MessageCircle,
  Copy,
  Crown,
  Gift,
  Ban,
  CheckCircle2,
  Trash2,
} from "lucide-react";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NegocioBillingCard } from "./negocio-billing-card";
import { fetchUserDetail, type AdminProfile, type UserDetailNegocio } from "@/lib/admin-data";
import { formatMoney, waLink } from "@/lib/mock";
import type { PlanId } from "@/lib/planes";

/** Título de sección (VER/CONTACTO/PLAN/PELIGRO) sobre una grilla de botones grandes — mismo patrón en cada bloque de acciones. */
function AccionesGrupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{titulo}</p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

export function UserDetailDialog({
  userId,
  onClose,
  onToggleRole,
  onToggleFundador,
  onSaveFacturacion,
  onImpersonate,
  onSetPlan,
  onSetTrial,
  onActivarPlan,
  onToggleBanned,
  onDeleteRequest,
}: {
  userId: string | null;
  onClose: () => void;
  onToggleRole: (profile: AdminProfile) => void;
  onToggleFundador: (negocioId: string, esFundador: boolean) => void;
  onSaveFacturacion: (
    negocioId: string,
    cambios: { precioCustom: number | null; trialInicio: string; trialFin: string; notasAdmin: string | null }
  ) => void;
  onImpersonate: (profile: AdminProfile) => void;
  onSetPlan: (negocioId: string, plan: PlanId, nombre: string) => void;
  onSetTrial: (negocioId: string, dias: 7 | 14 | 30, nombre: string) => void;
  onActivarPlan: (negocioId: string, plan: PlanId, nombre: string) => void;
  onToggleBanned: (profile: AdminProfile) => void;
  onDeleteRequest: (profile: AdminProfile) => void;
}) {
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

  const esFundadorAlgunNegocio = negocios.some((n) => n.esFundador);

  function copiarNumero(numero: string) {
    navigator.clipboard
      .writeText(numero)
      .then(() => toast.success("Número copiado"))
      .catch(() => toast.error("No se pudo copiar"));
  }

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
              <p className="text-xs text-muted-foreground">
                Registrado el{" "}
                {new Date(profile.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant={profile.role === "admin" ? "default" : "outline"}>{profile.role}</Badge>
                {esFundadorAlgunNegocio && (
                  <Badge variant="outline" className="border-primary/40 text-primary">
                    Fundador
                  </Badge>
                )}
                {profile.isBanned && (
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    Baneado
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-4 rounded-xl border border-border bg-surface p-3">
            <div>
              <p className="font-display text-lg font-bold">{negocios.length}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Negocios</p>
            </div>
            <div>
              <p className="font-display text-lg font-bold text-ledger">
                {formatMoney(negocios.reduce((sum, n) => sum + n.ingresosTotales, 0))}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ingresos totales</p>
            </div>
          </div>

          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Negocios · {negocios.length}
            </p>
            {negocios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no tiene ningún negocio.</p>
            ) : (
              <div className="flex flex-col gap-3">
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
                      <div>
                        <p className="font-display text-lg font-bold text-ledger">{formatMoney(n.ingresosTotales)}</p>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ingresos</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <NegocioBillingCard
                        negocio={n}
                        onToggleFundador={() => onToggleFundador(n.id, !n.esFundador)}
                        onSaveFacturacion={onSaveFacturacion}
                      />
                    </div>

                    <div className="mt-3 flex flex-col gap-3">
                      {n.ownerPhone && (
                        <AccionesGrupo titulo="Contacto">
                          <Button asChild size="sm" variant="ledger">
                            <a href={waLink(n.ownerPhone, `Hola, te escribo de Fuera Libreta sobre ${n.nombre}.`)} target="_blank" rel="noreferrer">
                              <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
                            </a>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => copiarNumero(n.ownerPhone)}>
                            <Copy className="h-4 w-4" /> Copiar número
                          </Button>
                        </AccionesGrupo>
                      )}
                      <AccionesGrupo titulo="Plan">
                        <Button size="sm" variant="outline" onClick={() => onActivarPlan(n.id, "pro", n.nombre)}>
                          <Crown className="h-4 w-4" /> Activar Pro 30d
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onSetTrial(n.id, 7, n.nombre)}>
                          <Gift className="h-4 w-4" /> Trial 7d
                        </Button>
                        <Button size="sm" variant="outline" className="col-span-2" onClick={() => onSetPlan(n.id, "basico", n.nombre)}>
                          Cambiar a Free
                        </Button>
                      </AccionesGrupo>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <AccionesGrupo titulo="Ver">
              <Button size="sm" variant="outline" className="col-span-2" onClick={() => onImpersonate(profile)}>
                <UserCog className="h-4 w-4" /> Ver como usuario
              </Button>
            </AccionesGrupo>
            <AccionesGrupo titulo="Peligro">
              <Button size="sm" variant="outline" onClick={() => onToggleRole(profile)}>
                {profile.role === "admin" ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {profile.role === "admin" ? "Quitar admin" : "Hacer admin"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onToggleBanned(profile)}>
                {profile.isBanned ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                {profile.isBanned ? "Activar" : "Banear"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="col-span-2"
                onClick={() => onDeleteRequest(profile)}
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            </AccionesGrupo>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
