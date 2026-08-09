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
import { UserDetailDialog } from "./user-detail-dialog";
import { NegocioDetailDialog } from "./negocio-detail-dialog";
import { ChangeOwnerDialog } from "./change-owner-dialog";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import {
  fetchAdminOverview,
  updateUserRole,
  updateUserPlan,
  setUserBanned,
  deleteNegocio,
  toggleNegocioActive,
  changeNegocioOwner,
  deleteUserCompletely,
  impersonateUser,
  updateLeadEstado,
  type AdminOverview,
  type AdminProfile,
  type AdminNegocio,
  type AdminLead,
} from "@/lib/admin-data";

type RoleFilter = "todos" | "admin" | "user";
type PlanFilter = "todos" | "free" | "pro";
type SortOrder = "recientes" | "antiguos";
type LeadEstadoFilter = "todos" | "nuevo" | "contactado" | "convertido";

export function AdminPanel({ currentUserId }: { currentUserId: string }) {
  const searchParams = useSearchParams();
  const [overview, setOverview] = React.useState<AdminOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState("usuarios");

  const [q, setQ] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>("todos");
  const [planFilter, setPlanFilter] = React.useState<PlanFilter>("todos");
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("recientes");
  const [orgQuery, setOrgQuery] = React.useState("");
  const [leadQuery, setLeadQuery] = React.useState("");
  const [leadEstadoFilter, setLeadEstadoFilter] = React.useState<LeadEstadoFilter>("todos");

  const [detailUserId, setDetailUserId] = React.useState<string | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = React.useState<AdminProfile | null>(null);
  const [detailNegocio, setDetailNegocio] = React.useState<AdminNegocio | null>(null);
  const [changeOwnerNegocio, setChangeOwnerNegocio] = React.useState<AdminNegocio | null>(null);
  const [deleteNegocioTarget, setDeleteNegocioTarget] = React.useState<AdminNegocio | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await fetchAdminOverview());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

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

  const filteredProfiles = React.useMemo(() => {
    if (!overview) return [];
    let list = overview.profiles;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((p) => p.email?.toLowerCase().includes(needle));
    }
    if (roleFilter !== "todos") list = list.filter((p) => p.role === roleFilter);
    if (planFilter !== "todos") list = list.filter((p) => p.plan === planFilter);
    return [...list].sort((a, b) =>
      sortOrder === "recientes" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)
    );
  }, [overview, q, roleFilter, planFilter, sortOrder]);

  const filteredNegocios = React.useMemo(() => {
    if (!overview) return [];
    if (!orgQuery.trim()) return overview.negocios;
    const needle = orgQuery.trim().toLowerCase();
    return overview.negocios.filter(
      (n) => n.nombre.toLowerCase().includes(needle) || n.ownerEmail?.toLowerCase().includes(needle)
    );
  }, [overview, orgQuery]);

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

  async function handleTogglePlan(p: AdminProfile) {
    const nextPlan = p.plan === "pro" ? "free" : "pro";
    try {
      await updateUserPlan(p.id, nextPlan);
      toast.success(`${p.email ?? "Usuario"} ahora está en plan ${nextPlan}.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el plan.");
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
    const promise = impersonateUser(p.id);
    toast.promise(promise, {
      loading: "Generando acceso...",
      success: "Listo, ábrelo en la pestaña nueva para entrar como este usuario.",
      error: (err) => (err instanceof Error ? err.message : "No se pudo generar el acceso."),
    });
    try {
      const url = await promise;
      window.open(url, "_blank");
    } catch {
      // el toast de arriba ya mostró el error
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
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCcw className="h-4 w-4" /> Actualizar
          </Button>
        </div>

        <div className="mt-6">
          <MetricsCards metrics={overview.metrics} />
        </div>

        <div className="mt-8">
          <Tabs
            value={tab}
            onValueChange={setTab}
            tabs={[
              { value: "usuarios", label: `Usuarios · ${overview.profiles.length}` },
              { value: "negocios", label: `Negocios · ${overview.negocios.length}` },
              { value: "leads", label: `Leads · ${overview.leads.length}` },
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
                <Chip selected={planFilter === "todos"} onClick={() => setPlanFilter("todos")}>
                  Free + Pro
                </Chip>
                <Chip selected={planFilter === "free"} onClick={() => setPlanFilter("free")}>
                  Free
                </Chip>
                <Chip selected={planFilter === "pro"} onClick={() => setPlanFilter("pro")}>
                  Pro
                </Chip>
              </ChipGroup>
              <Select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)} className="w-44">
                <option value="recientes">Más recientes</option>
                <option value="antiguos">Más antiguos</option>
              </Select>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <UsersTable
                profiles={filteredProfiles}
                currentUserId={currentUserId}
                onViewDetail={setDetailUserId}
                onToggleRole={handleToggleRole}
                onTogglePlan={handleTogglePlan}
                onToggleBanned={handleToggleBanned}
                onImpersonate={handleImpersonate}
                onDeleteRequest={setDeleteUserTarget}
              />
            </div>
          </div>
        ) : tab === "negocios" ? (
          <div className="mt-4">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={orgQuery}
                onChange={(e) => setOrgQuery(e.target.value)}
                placeholder="Buscar negocio o dueño..."
                className="pl-9"
              />
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <OrgsTable
                negocios={filteredNegocios}
                onViewDetail={setDetailNegocio}
                onChangeOwner={setChangeOwnerNegocio}
                onToggleActive={handleToggleNegocioActive}
                onDeleteRequest={setDeleteNegocioTarget}
              />
            </div>
          </div>
        ) : (
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
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <LeadsTable leads={filteredLeads} onMarkContactado={handleMarkLeadContactado} onConvertir={handleConvertirLead} />
            </div>
          </div>
        )}
      </div>

      <UserDetailDialog userId={detailUserId} onClose={() => setDetailUserId(null)} />
      <NegocioDetailDialog
        negocio={detailNegocio}
        onClose={() => setDetailNegocio(null)}
        onToggleActive={handleToggleNegocioActive}
        onDeleteRequest={(n) => {
          setDetailNegocio(null);
          setDeleteNegocioTarget(n);
        }}
      />
      <ChangeOwnerDialog negocio={changeOwnerNegocio} onClose={() => setChangeOwnerNegocio(null)} onSelect={handleChangeOwner} />

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
