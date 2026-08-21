"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Search, ShieldAlert, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/tabs";
import { LoadingBlock } from "@/components/app-shell/loading";
import { MetricsCards } from "./metrics-cards";
import { UsersTable } from "./users-table";
import { OrgsTable } from "./orgs-table";
import { LeadsTable } from "./leads-table";
import { ConsentimientosTable } from "./consentimientos-table";
import { CatalogoTab } from "./catalogo-tab";
import { UserDetailDialog } from "./user-detail-dialog";
import { NegocioDetailDialog } from "./negocio-detail-dialog";
import { ChangeOwnerDialog } from "./change-owner-dialog";
import { PrecioCustomDialog } from "./precio-custom-dialog";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import {
  fetchAdminOverview,
  computeAdminMetrics,
  updateUserRole,
  setUserBanned,
  deleteNegocio,
  toggleNegocioActive,
  updateNegocioPlan,
  updateNegocioTrial,
  activarPlanConDias,
  updateNegocioPrecioCustom,
  updateNegocioFundador,
  updateNegocioFacturacion,
  changeNegocioOwner,
  deleteUserCompletely,
  impersonateUser,
  updateLeadEstado,
  type AdminOverview,
  type AdminProfile,
  type AdminNegocio,
  type AdminLead,
  type Role,
  type Plan,
} from "@/lib/admin-data";
import { supabase } from "@/lib/supabase";
import { formatMoney } from "@/lib/mock";
import { PLAN_LABELS, formatTrial, estadoCobranza, type PlanId, type EstadoCobranza } from "@/lib/planes";

type RoleFilter = "todos" | "admin" | "user";
/** "trial" = todavía dentro de su periodo de prueba (trial_fin no vencido); "fundadores" = es_fundador = true. Reemplaza al viejo filtro por profiles.plan (free/pro) — ahora todo el filtrado de plan es a nivel negocio. */
type PlanEstadoFilter = "todos" | "basico" | "pro" | "pro_plus" | "trial" | "fundadores";
type SortOrder = "recientes" | "antiguos";
type LeadEstadoFilter = "todos" | "nuevo" | "contactado" | "convertido";

const PLAN_ESTADO_OPCIONES: { value: PlanEstadoFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "basico", label: "Básico" },
  { value: "pro", label: "Pro" },
  { value: "pro_plus", label: "Pro+" },
  { value: "trial", label: "Trial" },
  { value: "fundadores", label: "Fundadores" },
];

const COBRANZA_OPCIONES: { value: EstadoCobranza; label: string; dot: string }[] = [
  { value: "vencido", label: "Vencidos", dot: "🔴" },
  { value: "por_vencer", label: "Por vencer <3d", dot: "🟡" },
  { value: "activo", label: "Activos", dot: "🟢" },
  { value: "trial", label: "Trial", dot: "⚪" },
];

function pasaFiltroPlan(negocio: AdminNegocio | undefined, filtro: PlanEstadoFilter): boolean {
  if (filtro === "todos") return true;
  if (!negocio) return false;
  if (filtro === "trial") return !formatTrial(negocio.trialFin).vencido;
  if (filtro === "fundadores") return negocio.esFundador;
  return negocio.plan === filtro;
}

export function AdminPanel({ currentUserId }: { currentUserId: string }) {
  const searchParams = useSearchParams();
  const [overview, setOverview] = React.useState<AdminOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  // Abre directo en Negocios (no Usuarios) para que Owen entre y vea a
  // quién cobrarle sin un clic extra — ver cobranzaFilter abajo.
  const [tab, setTab] = React.useState("negocios");

  const [q, setQ] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>("todos");
  const [planFilter, setPlanFilter] = React.useState<PlanEstadoFilter>("todos");
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("recientes");
  const [orgQuery, setOrgQuery] = React.useState("");
  const [orgPlanFilter, setOrgPlanFilter] = React.useState<PlanEstadoFilter>("todos");
  // Default "por_vencer": es la razón por la que Owen entra a /admin cada
  // mes — a quién cobrarle antes de que se le bloquee la cuenta.
  const [cobranzaFilter, setCobranzaFilter] = React.useState<EstadoCobranza>("por_vencer");
  const [leadQuery, setLeadQuery] = React.useState("");
  const [leadEstadoFilter, setLeadEstadoFilter] = React.useState<LeadEstadoFilter>("todos");
  // Las cards de arriba (Total usuarios, Negocios activos...) cuentan al
  // admin actual junto con todos los demás — este filtro las recalcula sin
  // él (ver el cálculo de `metrics` más abajo), para que un admin que
  // también trae su propio negocio de prueba no infle sus propios números.
  const [excludeSelf, setExcludeSelf] = React.useState(false);

  const [detailUserId, setDetailUserId] = React.useState<string | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = React.useState<AdminProfile | null>(null);
  const [detailNegocio, setDetailNegocio] = React.useState<AdminNegocio | null>(null);
  const [changeOwnerNegocio, setChangeOwnerNegocio] = React.useState<AdminNegocio | null>(null);
  const [precioCustomNegocio, setPrecioCustomNegocio] = React.useState<AdminNegocio | null>(null);
  const [deleteNegocioTarget, setDeleteNegocioTarget] = React.useState<AdminNegocio | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await fetchAdminOverview(currentUserId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Realtime de profiles (4to canal de la app — los otros 3 son
  // barberia_citas/abarrotes_ventas/negocios, todos por negocio_id dentro
  // de la sesión de UN dueño en lib/session.ts). Este es propio de /admin:
  // un canal local a esta página, sin el patrón "canal compartido entre
  // varias instancias de useSession()" de los otros — AdminPanel es una
  // sola instancia, no hay riesgo de doble .subscribe() al mismo topic.
  // Requiere `alter publication supabase_realtime add table profiles;` del
  // lado de Supabase (ya corrido).
  React.useEffect(() => {
    const channel = supabase
      .channel("admin-profiles")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        const nuevo: AdminProfile = {
          id: row.id as string,
          email: (row.email as string) ?? null,
          avatarUrl: (row.avatar_url as string) ?? null,
          role: (row.role as Role) ?? "user",
          plan: (row.plan as Plan) ?? "free",
          isBanned: Boolean(row.is_banned),
          createdAt: row.created_at as string,
          negociosCount: 0,
        };
        setOverview((prev) => {
          if (!prev) return prev;
          // Eco de un profile que esta misma pestaña ya tenía (ej. otro
          // admin cargó justo antes de que llegara el evento) — nunca
          // duplicar la fila ni recontar en las tarjetas de arriba.
          if (prev.profiles.some((p) => p.id === nuevo.id)) return prev;
          const profiles = [nuevo, ...prev.profiles];
          return { ...prev, profiles, metrics: computeAdminMetrics(profiles, prev.negocios, prev.metrics.totalMovimientos) };
        });
        toast.success(`Nuevo usuario: ${nuevo.email ?? nuevo.id}`);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        setOverview((prev) => {
          if (!prev) return prev;
          const profiles = prev.profiles.map((p) =>
            p.id === row.id
              ? {
                  ...p,
                  email: (row.email as string) ?? p.email,
                  avatarUrl: (row.avatar_url as string) ?? p.avatarUrl,
                  role: (row.role as Role) ?? p.role,
                  plan: (row.plan as Plan) ?? p.plan,
                  isBanned: Boolean(row.is_banned),
                }
              : p
          );
          return { ...prev, profiles };
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "profiles" }, (payload) => {
        const oldRow = payload.old as Record<string, unknown>;
        setOverview((prev) => {
          if (!prev) return prev;
          const profiles = prev.profiles.filter((p) => p.id !== oldRow.id);
          return { ...prev, profiles, metrics: computeAdminMetrics(profiles, prev.negocios, prev.metrics.totalMovimientos) };
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Deep-link desde /app/admin-dashboard (?negocio=<id>): abre directo el
  // detalle de ese negocio en vez de dejar al admin buscarlo a mano.
  React.useEffect(() => {
    if (!overview) return;
    const negocioId = searchParams.get("negocio");
    if (!negocioId) return;
    const negocio = overview.negocios.find((n) => n.id === negocioId);
    if (negocio) {
      setTab("negocios");
      setDetailNegocio(negocio);
    }
  }, [overview, searchParams]);

  const negocioPorOwner = React.useMemo(() => {
    const map = new Map<string, AdminNegocio>();
    for (const n of overview?.negocios ?? []) {
      if (n.ownerId && !map.has(n.ownerId)) map.set(n.ownerId, n);
    }
    return map;
  }, [overview]);

  const filteredProfiles = React.useMemo(() => {
    if (!overview) return [];
    let list = overview.profiles;
    if (excludeSelf) list = list.filter((p) => p.id !== currentUserId);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((p) => p.email?.toLowerCase().includes(needle));
    }
    if (roleFilter !== "todos") list = list.filter((p) => p.role === roleFilter);
    if (planFilter !== "todos") list = list.filter((p) => pasaFiltroPlan(negocioPorOwner.get(p.id), planFilter));
    return [...list].sort((a, b) =>
      sortOrder === "recientes" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)
    );
  }, [overview, excludeSelf, currentUserId, q, roleFilter, planFilter, sortOrder, negocioPorOwner]);

  // Base para los contadores reales de los 4 tabs de cobranza — antes de
  // aplicarles el propio filtro de cobranza (si no, cada tab siempre
  // contaría solo contra sí mismo) pero después de "Excluirme"/búsqueda/
  // plan, para que los números que ve Owen coincidan con lo que va a ver en
  // la tabla al cambiar de tab.
  const negociosBaseCobranza = React.useMemo(() => {
    if (!overview) return [];
    let list = overview.negocios;
    if (excludeSelf) list = list.filter((n) => n.ownerId !== currentUserId);
    if (orgQuery.trim()) {
      const needle = orgQuery.trim().toLowerCase();
      list = list.filter(
        (n) => n.nombre.toLowerCase().includes(needle) || n.ownerEmail?.toLowerCase().includes(needle) || n.id.toLowerCase().includes(needle)
      );
    }
    if (orgPlanFilter !== "todos") list = list.filter((n) => pasaFiltroPlan(n, orgPlanFilter));
    return list;
  }, [overview, excludeSelf, currentUserId, orgQuery, orgPlanFilter]);

  const cobranzaCounts = React.useMemo(() => {
    const counts: Record<EstadoCobranza, number> = { vencido: 0, por_vencer: 0, activo: 0, trial: 0 };
    for (const n of negociosBaseCobranza) counts[estadoCobranza(n)]++;
    return counts;
  }, [negociosBaseCobranza]);

  const filteredNegocios = React.useMemo(() => {
    // vence ASC: el que vence hoy (o ya venció hace más días) va primero —
    // así la fila de arriba siempre es la más urgente de cobrar.
    return negociosBaseCobranza
      .filter((n) => estadoCobranza(n) === cobranzaFilter)
      .sort((a, b) => a.trialFin.localeCompare(b.trialFin));
  }, [negociosBaseCobranza, cobranzaFilter]);

  const filteredLeads = React.useMemo(() => {
    if (!overview) return [];
    let list = overview.leads;
    if (leadQuery.trim()) {
      const needle = leadQuery.trim().toLowerCase();
      list = list.filter((l) => l.nombre.toLowerCase().includes(needle) || l.whatsapp.includes(needle));
    }
    if (leadEstadoFilter !== "todos") list = list.filter((l) => l.estado === leadEstadoFilter);
    return list;
  }, [overview, leadQuery, leadEstadoFilter]);

  async function handleToggleRole(p: AdminProfile) {
    const nextRole = p.role === "admin" ? "user" : "admin";
    try {
      await updateUserRole(p.id, nextRole);
      toast.success(`${p.email ?? "Usuario"} ahora es ${nextRole}.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el rol.");
    }
  }

  async function handleSetNegocioPlan(negocioId: string, plan: PlanId, nombre: string) {
    try {
      await updateNegocioPlan(negocioId, plan);
      toast.success(`${nombre} ahora está en plan ${PLAN_LABELS[plan]}.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el plan.");
    }
  }

  async function handleSetNegocioTrial(negocioId: string, dias: 7 | 14 | 30, nombre: string) {
    try {
      await updateNegocioTrial(negocioId, dias);
      toast.success(`${nombre}: trial extendido ${dias} días.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el trial.");
    }
  }

  /** Un clic tras confirmar el pago por WhatsApp: cambia el plan y extiende trial_fin 30 días a la vez. */
  async function handleActivarPlan(negocioId: string, plan: PlanId, nombre: string) {
    try {
      await activarPlanConDias(negocioId, plan);
      toast.success(`${nombre}: activado ${PLAN_LABELS[plan]} por 30 días.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo activar el plan.");
    }
  }

  async function handleToggleFundadorById(negocioId: string, esFundador: boolean, nombre?: string) {
    try {
      await updateNegocioFundador(negocioId, esFundador);
      toast.success(esFundador ? `${nombre ?? "El negocio"} ahora es Fundador.` : `${nombre ?? "El negocio"} ya no es Fundador.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el estatus de fundador.");
    }
  }

  function handleToggleFundador(n: AdminNegocio) {
    handleToggleFundadorById(n.id, !n.esFundador, n.nombre);
  }

  async function handleSaveFacturacion(
    negocioId: string,
    cambios: { precioCustom: number | null; trialInicio: string; trialFin: string; notasAdmin: string | null }
  ) {
    try {
      await updateNegocioFacturacion(negocioId, cambios);
      toast.success("Facturación actualizada.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar la facturación.");
    }
  }

  async function handleSavePrecioCustom(negocioId: string, precio: number | null) {
    try {
      await updateNegocioPrecioCustom(negocioId, precio);
      toast.success(precio == null ? "Precio custom quitado." : `Precio custom: ${formatMoney(precio)}/mes.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el precio.");
    }
  }

  async function handleToggleBanned(p: AdminProfile) {
    try {
      await setUserBanned(p.id, !p.isBanned);
      toast.success(p.isBanned ? `${p.email ?? "Usuario"} desbaneado.` : `${p.email ?? "Usuario"} baneado.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el estado.");
    }
  }

  async function handleImpersonate(p: AdminProfile) {
    try {
      await impersonateUser(p.id);
      // Recarga completa (no router.push): useSession() cachea el negocio
      // resuelto por usuario en un módulo compartido — solo una carga
      // fresca garantiza que arranque de cero con la sesión ya cambiada al
      // usuario objetivo en las cookies.
      window.location.href = "/app";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el acceso.");
    }
  }

  async function handleDeleteUser() {
    if (!deleteUserTarget) return;
    try {
      await deleteUserCompletely(deleteUserTarget.id);
      toast.success(`${deleteUserTarget.email ?? "Usuario"} eliminado.`);
      setDeleteUserTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar el usuario.");
    }
  }

  async function handleToggleNegocioActive(n: AdminNegocio) {
    try {
      await toggleNegocioActive(n.id, !n.isActive);
      toast.success(n.isActive ? `${n.nombre} pausado.` : `${n.nombre} activado.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el negocio.");
    }
  }

  async function handleChangeOwner(userId: string, email: string | null) {
    if (!changeOwnerNegocio) return;
    try {
      await changeNegocioOwner(changeOwnerNegocio.id, userId);
      toast.success(`${changeOwnerNegocio.nombre} ahora es de ${email ?? userId}.`);
      setChangeOwnerNegocio(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el owner.");
    }
  }

  async function handleDeleteNegocio() {
    if (!deleteNegocioTarget) return;
    try {
      await deleteNegocio(deleteNegocioTarget.id);
      toast.success(`${deleteNegocioTarget.nombre} eliminado.`);
      setDeleteNegocioTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar el negocio.");
    }
  }

  async function handleMarkLeadContactado(lead: AdminLead) {
    try {
      await updateLeadEstado(lead.id, "contactado");
      toast.success(`${lead.nombre} marcado como contactado.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el lead.");
    }
  }

  async function handleConvertirLead(lead: AdminLead) {
    try {
      await updateLeadEstado(lead.id, "convertido");
      toast.success(`${lead.nombre} marcado como convertido. Crea el negocio manualmente desde /onboarding.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el lead.");
    }
  }

  if (loading || !overview) return <LoadingBlock />;

  // "Excluirme": recalcula usuarios/negocios/por-tipo Y Libretas
  // digitalizadas sin el profile ni el negocio del admin actual — este
  // último usando movimientosPropios (ya viene calculado desde
  // fetchAdminOverview, acotado por negocio_id) en vez de pegarle otra vez
  // a Supabase.
  const metrics = excludeSelf
    ? computeAdminMetrics(
        overview.profiles.filter((p) => p.id !== currentUserId),
        overview.negocios.filter((n) => n.ownerId !== currentUserId),
        overview.metrics.totalMovimientos - overview.movimientosPropios
      )
    : overview.metrics;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">Panel de administración</h1>
              <p className="text-xs text-muted-foreground">Control total de usuarios y negocios</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Chip selected={excludeSelf} onClick={() => setExcludeSelf((v) => !v)}>
              Excluirme
            </Chip>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCcw className="h-4 w-4" /> Actualizar
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <MetricsCards metrics={metrics} />
        </div>

        <div className="mt-8">
          <Tabs
            value={tab}
            onValueChange={setTab}
            tabs={[
              {
                value: "usuarios",
                label: `Usuarios · ${(excludeSelf ? overview.profiles.filter((p) => p.id !== currentUserId) : overview.profiles).length}`,
              },
              {
                value: "negocios",
                label: `Negocios · ${(excludeSelf ? overview.negocios.filter((n) => n.ownerId !== currentUserId) : overview.negocios).length}`,
              },
              { value: "leads", label: `Leads · ${overview.leads.length}` },
              { value: "consentimientos", label: `Consentimientos · ${overview.consentimientos.length}` },
              { value: "catalogo", label: "Catálogo" },
            ]}
            className="max-w-lg"
          />
        </div>

        {tab === "usuarios" ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por email..." className="pl-9" />
              </div>
              <ChipGroup>
                <Chip selected={roleFilter === "todos"} onClick={() => setRoleFilter("todos")}>
                  Todos
                </Chip>
                <Chip selected={roleFilter === "admin"} onClick={() => setRoleFilter("admin")}>
                  Admin
                </Chip>
                <Chip selected={roleFilter === "user"} onClick={() => setRoleFilter("user")}>
                  User
                </Chip>
              </ChipGroup>
              <ChipGroup>
                {PLAN_ESTADO_OPCIONES.map((o) => (
                  <Chip key={o.value} selected={planFilter === o.value} onClick={() => setPlanFilter(o.value)}>
                    {o.label}
                  </Chip>
                ))}
              </ChipGroup>
              <Select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)} className="w-44">
                <option value="recientes">Más recientes</option>
                <option value="antiguos">Más antiguos</option>
              </Select>
            </div>

            <div className="mt-4 max-w-full overflow-hidden rounded-2xl border border-border">
              <UsersTable
                profiles={filteredProfiles}
                negocios={overview.negocios}
                currentUserId={currentUserId}
                onViewDetail={setDetailUserId}
              />
            </div>
          </div>
        ) : tab === "negocios" ? (
          <div className="mt-4">
            <ChipGroup>
              {COBRANZA_OPCIONES.map((o) => (
                <Chip key={o.value} selected={cobranzaFilter === o.value} onClick={() => setCobranzaFilter(o.value)}>
                  {o.dot} {o.label} · {cobranzaCounts[o.value]}
                </Chip>
              ))}
            </ChipGroup>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={orgQuery}
                  onChange={(e) => setOrgQuery(e.target.value)}
                  placeholder="Buscar negocio, dueño o ID..."
                  className="pl-9"
                />
              </div>
              <ChipGroup>
                {PLAN_ESTADO_OPCIONES.map((o) => (
                  <Chip key={o.value} selected={orgPlanFilter === o.value} onClick={() => setOrgPlanFilter(o.value)}>
                    {o.label}
                  </Chip>
                ))}
              </ChipGroup>
            </div>
            <div className="mt-4 max-w-full overflow-hidden rounded-2xl border border-border">
              <OrgsTable
                negocios={filteredNegocios}
                profiles={overview.profiles}
                currentUserId={currentUserId}
                onViewDetail={setDetailNegocio}
                onImpersonate={handleImpersonate}
                onSetPlan={(n, plan) => handleSetNegocioPlan(n.id, plan, n.nombre)}
                onSetTrial={(n, dias) => handleSetNegocioTrial(n.id, dias, n.nombre)}
                onActivarPlan={(n, plan) => handleActivarPlan(n.id, plan, n.nombre)}
                onSetPrecioCustom={setPrecioCustomNegocio}
                onToggleFundador={handleToggleFundador}
                onToggleBanned={handleToggleBanned}
                onDeleteRequest={setDeleteNegocioTarget}
              />
            </div>
          </div>
        ) : tab === "leads" ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Buscar por nombre o WhatsApp..."
                  className="pl-9"
                />
              </div>
              <ChipGroup>
                <Chip selected={leadEstadoFilter === "todos"} onClick={() => setLeadEstadoFilter("todos")}>
                  Todos
                </Chip>
                <Chip selected={leadEstadoFilter === "nuevo"} onClick={() => setLeadEstadoFilter("nuevo")}>
                  Nuevo
                </Chip>
                <Chip selected={leadEstadoFilter === "contactado"} onClick={() => setLeadEstadoFilter("contactado")}>
                  Contactado
                </Chip>
                <Chip selected={leadEstadoFilter === "convertido"} onClick={() => setLeadEstadoFilter("convertido")}>
                  Convertido
                </Chip>
              </ChipGroup>
            </div>
            <div className="mt-4 max-w-full overflow-hidden rounded-2xl border border-border">
              <LeadsTable leads={filteredLeads} onMarkContactado={handleMarkLeadContactado} onConvertir={handleConvertirLead} />
            </div>
          </div>
        ) : tab === "consentimientos" ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <ConsentimientosTable consentimientos={overview.consentimientos} />
          </div>
        ) : (
          <CatalogoTab />
        )}
      </div>

      <UserDetailDialog
        userId={detailUserId}
        onClose={() => setDetailUserId(null)}
        onToggleRole={handleToggleRole}
        onToggleFundador={handleToggleFundadorById}
        onSaveFacturacion={handleSaveFacturacion}
        onImpersonate={handleImpersonate}
        onSetPlan={handleSetNegocioPlan}
        onSetTrial={handleSetNegocioTrial}
        onActivarPlan={handleActivarPlan}
        onToggleBanned={handleToggleBanned}
        onDeleteRequest={setDeleteUserTarget}
      />
      <NegocioDetailDialog
        negocio={detailNegocio}
        onClose={() => setDetailNegocio(null)}
        onToggleActive={handleToggleNegocioActive}
        onChangeOwner={(n) => {
          setDetailNegocio(null);
          setChangeOwnerNegocio(n);
        }}
        onToggleFundador={handleToggleFundadorById}
        onSaveFacturacion={handleSaveFacturacion}
        onDeleteRequest={(n) => {
          setDetailNegocio(null);
          setDeleteNegocioTarget(n);
        }}
      />
      <ChangeOwnerDialog negocio={changeOwnerNegocio} onClose={() => setChangeOwnerNegocio(null)} onSelect={handleChangeOwner} />
      <PrecioCustomDialog
        negocio={precioCustomNegocio}
        onClose={() => setPrecioCustomNegocio(null)}
        onSave={handleSavePrecioCustom}
      />

      <ConfirmDeleteDialog
        open={!!deleteUserTarget}
        title="Eliminar usuario"
        description={`Esto borra a ${deleteUserTarget?.email ?? "este usuario"} de auth por completo, junto con todos sus negocios y datos. No se puede deshacer.`}
        onClose={() => setDeleteUserTarget(null)}
        onConfirm={handleDeleteUser}
      />
      <ConfirmDeleteDialog
        open={!!deleteNegocioTarget}
        title="Eliminar negocio"
        description={`¿Borrar todo? Esto cumple con el derecho de cancelación (LFPDPPP / ARCO) del dueño: borra ${deleteNegocioTarget?.nombre ?? "este negocio"} y en cascada todos sus datos (clientes, citas, ventas...). No se puede deshacer.`}
        onClose={() => setDeleteNegocioTarget(null)}
        onConfirm={handleDeleteNegocio}
      />
    </main>
  );
}
