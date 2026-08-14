"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, Check, MessageCircle, Mail, LogIn, Ban, CheckCircle2, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NegocioBillingCard } from "./negocio-billing-card";
import { cn } from "@/lib/utils";
import { waLink, formatMoney, formatRelativeTime } from "@/lib/mock";
import { fetchNegocioDetail, prepareArcoRequest, type AdminNegocio, type NegocioDetail } from "@/lib/admin-data";

const TIPO_LABEL: Record<AdminNegocio["tipo"], string> = {
  barberia: "Barbería",
  fonda: "Fonda",
  abarrotes: "Abarrotes",
};

function fechaLarga(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

export function NegocioDetailDialog({
  negocio,
  onClose,
  onToggleActive,
  onChangeOwner,
  onToggleFundador,
  onSaveFacturacion,
  onDeleteRequest,
}: {
  negocio: AdminNegocio | null;
  onClose: () => void;
  onToggleActive: (negocio: AdminNegocio) => void;
  onChangeOwner: (negocio: AdminNegocio) => void;
  onToggleFundador: (negocioId: string, esFundador: boolean) => void;
  onSaveFacturacion: (
    negocioId: string,
    cambios: { precioCustom: number | null; trialInicio: string; trialFin: string; notasAdmin: string | null }
  ) => void;
  onDeleteRequest: (negocio: AdminNegocio) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<NegocioDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copiado, setCopiado] = React.useState(false);

  React.useEffect(() => {
    if (!negocio) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
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

  const publicUrl = detail ? `https://fueralibreta.com/b/${detail.slug}` : "";

  function copiarLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  function handleEntrarComoDueno() {
    if (!detail) return;
    // Placeholder visual: todavía no existe bypass de auth real, solo navega
    // a la ruta que en el futuro será el dashboard impersonado del negocio.
    router.push(`/dashboard/${detail.id}`);
  }

  async function handleArco() {
    if (!detail) return;
    const result = await prepareArcoRequest(detail.id);
    toast.info(result.message);
  }

  return (
    <Dialog open={!!negocio} onOpenChange={(o) => !o && onClose()} className="max-w-xl">
      {/* Sección 1: header — nombre, email del dueño, badges de tipo y estado */}
      <DialogHeader
        title={detail?.nombre ?? negocio?.nombre ?? "Negocio"}
        description={detail?.ownerEmail ?? negocio?.ownerEmail ?? undefined}
        onClose={onClose}
      />
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-destructive">{error}</p>
      ) : detail ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="capitalize">
              {TIPO_LABEL[detail.tipo]}
            </Badge>
            <Badge variant={detail.isActive ? "ledger" : "outline"}>{detail.isActive ? "Activo" : "Pausado"}</Badge>
          </div>

          <NegocioBillingCard
            negocio={detail}
            onToggleFundador={() => onToggleFundador(detail.id, !detail.esFundador)}
            onSaveFacturacion={onSaveFacturacion}
          />

          {/* Sección 2: métricas en grid 2x2 */}
          <div className="grid grid-cols-2 gap-3">
            {detail.stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
                <p className="font-display text-xl font-bold">{s.value}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
              </div>
            ))}
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="font-display text-xl font-bold">{formatMoney(detail.ingresosTotales)}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ingresos totales</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="font-display text-xl font-bold leading-tight">
                {detail.ultimaActividad ? formatRelativeTime(detail.ultimaActividad) : "Sin actividad"}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Última actividad</p>
            </div>
          </div>

          {/* Sección 3: contacto y acceso */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{publicUrl}</p>
              <Button variant="outline" size="sm" onClick={copiarLink}>
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado ? "¡Copiado!" : "Copiar"}
              </Button>
            </div>
            {detail.ownerPhone && (
              <a
                href={waLink(detail.ownerPhone, `Hola, te escribo de Fuera Libreta sobre ${detail.nombre}.`)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <MessageCircle className="h-4 w-4 shrink-0" /> WhatsApp del dueño · {detail.ownerPhone}
              </a>
            )}
            {detail.ownerEmail && (
              <a href={`mailto:${detail.ownerEmail}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Mail className="h-4 w-4 shrink-0" /> {detail.ownerEmail}
              </a>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Creado el {fechaLarga(detail.createdAt)} · slug <span className="font-mono">{detail.slug}</span> · ID{" "}
            <span className="font-mono">{detail.id.slice(0, 8)}</span>
          </p>

          {/* Sección 4: acciones de soporte */}
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleEntrarComoDueno}>
                <LogIn className="h-4 w-4" /> Entrar como dueño
              </Button>
              <Button variant="outline" size="sm" onClick={() => onToggleActive(detail)}>
                {detail.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {detail.isActive ? "Suspender" : "Reactivar"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => onChangeOwner(detail)}>
                <UserCog className="h-4 w-4" /> Cambiar owner
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn("border-destructive text-destructive hover:bg-destructive/10 hover:border-destructive")}
                onClick={() => onDeleteRequest(detail)}
              >
                <Trash2 className="h-4 w-4" /> Eliminar negocio
              </Button>
            </div>
            <button
              type="button"
              onClick={handleArco}
              className="w-fit text-left text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Ver consentimientos / Fecha aceptación aviso privacidad
            </button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
