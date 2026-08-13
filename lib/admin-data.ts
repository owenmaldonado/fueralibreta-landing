import { supabase } from "./supabase";
import { normalizarPlan, type PlanId } from "./planes";
import type { BusinessType } from "./types";
import type { LeadTipoNegocio } from "./validation";

// ============================================================================
// Datos del panel /admin. Las LECTURAS (overview, detalle de usuario/negocio)
// corren con la sesión normal del admin en el navegador, apoyándose en las
// policies "*_admin_all" del esquema — no necesitan la service_role key.
// Las ESCRITURAS sobre profiles (rol/plan/baneo), eliminar un usuario por
// completo e "impersonar" pegan a rutas /api/admin/* que verifican is_admin
// y ejecutan con la service_role key, sin depender de que RLS esté bien
// puesta — ver lib/admin-auth.ts.
// ============================================================================

export type Role = "admin" | "user";
export type Plan = "free" | "pro";

/**
 * Chequeo de admin por email, hardcodeado a propósito: profiles.role
 * depende de RLS/policies que pueden fallar en silencio (auth.getUser()
 * nunca falla así), así que esto es lo que decide si se muestra la entrada
 * a /admin en la UI. La protección real sigue siendo del servidor:
 * app/admin/page.tsx y /api/admin/* verifican profiles.role ahí mismo con
 * su propia sesión antes de dejar pasar nada.
 */
export const ADMIN_EMAIL = "owenxmaldonado100@gmail.com";

export interface AdminProfile {
  id: string;
  email: string | null;
  avatarUrl: string | null;
  role: Role;
  plan: Plan;
  isBanned: boolean;
  createdAt: string;
  negociosCount: number;
}

export interface AdminNegocio {
  id: string;
  slug: string;
  nombre: string;
  tipo: BusinessType;
  ownerId: string | null;
  ownerEmail: string | null;
  ownerPhone: string;
  isActive: boolean;
  createdAt: string;
  plan: PlanId;
}

export interface AdminMetrics {
  totalUsuarios: number;
  totalNegocios: number;
  totalMovimientos: number;
  usuariosNuevosHoy: number;
  totalBarberias: number;
  totalFondas: number;
  totalAbarrotes: number;
}

export interface AdminOverview {
  profiles: AdminProfile[];
  negocios: AdminNegocio[];
  leads: AdminLead[];
  metrics: AdminMetrics;
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const [profilesRes, negociosRes, citasRes, pedidosRes, ventasRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("negocios").select("*").order("created_at", { ascending: false }),
    supabase.from("barberia_citas").select("*", { count: "exact", head: true }),
    supabase.from("fonda_pedidos").select("*", { count: "exact", head: true }),
    supabase.from("abarrotes_ventas").select("*", { count: "exact", head: true }),
  ]);
  for (const r of [profilesRes, negociosRes, citasRes, pedidosRes, ventasRes]) {
    if (r.error) throw r.error;
  }
  // No tumba el panel completo si la migración de `leads` (PR #3) todavía no
  // corrió en este proyecto de Supabase: el tab de Leads simplemente queda en 0.
  const leads = await fetchLeads().catch(() => []);

  const profilesById = new Map((profilesRes.data ?? []).map((p) => [p.id as string, p]));
  const negociosByOwner = new Map<string, number>();
  for (const n of negociosRes.data ?? []) {
    if (!n.owner_id) continue;
    negociosByOwner.set(n.owner_id, (negociosByOwner.get(n.owner_id) ?? 0) + 1);
  }

  const profiles: AdminProfile[] = (profilesRes.data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    avatarUrl: p.avatar_url ?? null,
    role: p.role,
    plan: p.plan,
    isBanned: p.is_banned,
    createdAt: p.created_at,
    negociosCount: negociosByOwner.get(p.id) ?? 0,
  }));

  const negocios: AdminNegocio[] = (negociosRes.data ?? []).map((n) => ({
    id: n.id,
    slug: n.slug,
    nombre: n.nombre,
    tipo: n.tipo,
    ownerId: n.owner_id,
    ownerEmail: n.owner_id ? (profilesById.get(n.owner_id)?.email ?? null) : null,
    ownerPhone: n.telefono ?? "",
    isActive: n.is_active,
    createdAt: n.created_at,
    plan: normalizarPlan(n.plan),
  }));

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const usuariosNuevosHoy = profiles.filter((p) => new Date(p.createdAt) >= hoy).length;

  return {
    profiles,
    negocios,
    leads,
    metrics: {
      totalUsuarios: profiles.length,
      totalNegocios: negocios.length,
      totalMovimientos: (citasRes.count ?? 0) + (pedidosRes.count ?? 0) + (ventasRes.count ?? 0),
      usuariosNuevosHoy,
      totalBarberias: negocios.filter((n) => n.tipo === "barberia").length,
      totalFondas: negocios.filter((n) => n.tipo === "fonda").length,
      totalAbarrotes: negocios.filter((n) => n.tipo === "abarrotes").length,
    },
  };
}

async function patchUserProfile(userId: string, cambios: { role?: Role; plan?: Plan; is_banned?: boolean }): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  });
  const body = await parseJsonResponse(res);
  if (!res.ok) throw new Error(body.error ?? "No se pudo actualizar el usuario.");
}

export async function updateUserRole(userId: string, role: Role): Promise<void> {
  await patchUserProfile(userId, { role });
}

export async function updateUserPlan(userId: string, plan: Plan): Promise<void> {
  await patchUserProfile(userId, { plan });
}

export async function setUserBanned(userId: string, isBanned: boolean): Promise<void> {
  await patchUserProfile(userId, { is_banned: isBanned });
}

export interface UserDetailNegocio {
  id: string;
  nombre: string;
  tipo: BusinessType;
  isActive: boolean;
  createdAt: string;
  stats: { label: string; value: number }[];
  ingresosTotales: number;
}

interface NegocioExtra {
  stats: { label: string; value: number }[];
  ingresosTotales: number;
  ultimaActividad: string | null;
}

function maxFecha(...fechas: (string | null | undefined)[]): string | null {
  let max: string | null = null;
  for (const f of fechas) {
    if (f && (!max || f > max)) max = f;
  }
  return max;
}

/** No hay columna `updated_at` en el esquema: "última actividad" se aproxima con el created_at/fecha más reciente entre las tablas del negocio. */
async function computeNegocioExtra(negocioId: string, tipo: BusinessType): Promise<NegocioExtra> {
  if (tipo === "barberia") {
    const [clientes, citas, ultimaCita, caja] = await Promise.all([
      supabase.from("barberia_clientes").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId),
      supabase.from("barberia_citas").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId),
      supabase
        .from("barberia_citas")
        .select("created_at")
        .eq("negocio_id", negocioId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("barberia_caja").select("monto,tipo,fecha").eq("negocio_id", negocioId),
    ]);
    const ventasCaja = (caja.data ?? []).filter((c) => c.tipo === "venta");
    return {
      stats: [
        { label: "Clientes", value: clientes.count ?? 0 },
        { label: "Citas", value: citas.count ?? 0 },
      ],
      ingresosTotales: ventasCaja.reduce((sum, c) => sum + Number(c.monto), 0),
      ultimaActividad: maxFecha(ultimaCita.data?.created_at, ...(caja.data ?? []).map((c) => c.fecha)),
    };
  }
  if (tipo === "fonda") {
    // fonda no tiene tabla de clientes propia (el nombre/teléfono vive inline
    // en cada pedido): se aproxima con teléfonos distintos entre sus pedidos.
    const [pedidos, entregados, ultimoPedido, telefonos] = await Promise.all([
      supabase.from("fonda_pedidos").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId),
      supabase.from("fonda_pedidos").select("total").eq("negocio_id", negocioId).eq("estado", "entregado"),
      supabase
        .from("fonda_pedidos")
        .select("created_at")
        .eq("negocio_id", negocioId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("fonda_pedidos").select("cliente_telefono").eq("negocio_id", negocioId),
    ]);
    const clientesUnicos = new Set((telefonos.data ?? []).map((p) => p.cliente_telefono).filter(Boolean)).size;
    return {
      stats: [
        { label: "Clientes", value: clientesUnicos },
        { label: "Pedidos", value: pedidos.count ?? 0 },
      ],
      ingresosTotales: (entregados.data ?? []).reduce((sum, p) => sum + Number(p.total), 0),
      ultimaActividad: ultimoPedido.data?.created_at ?? null,
    };
  }
  const [productos, ventasCount, ventas, ultimaVenta] = await Promise.all([
    supabase.from("abarrotes_productos").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId),
    supabase.from("abarrotes_ventas").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId),
    supabase.from("abarrotes_ventas").select("total").eq("negocio_id", negocioId),
    supabase
      .from("abarrotes_ventas")
      .select("fecha")
      .eq("negocio_id", negocioId)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    stats: [
      { label: "Productos", value: productos.count ?? 0 },
      { label: "Ventas", value: ventasCount.count ?? 0 },
    ],
    ingresosTotales: (ventas.data ?? []).reduce((sum, v) => sum + Number(v.total), 0),
    ultimaActividad: ultimaVenta.data?.fecha ?? null,
  };
}

export async function fetchUserDetail(
  userId: string
): Promise<{ profile: AdminProfile | null; negocios: UserDetailNegocio[] }> {
  const [{ data: profileRow, error: profileErr }, { data: negociosRows, error: negErr }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("negocios").select("*").eq("owner_id", userId),
  ]);
  if (profileErr) throw profileErr;
  if (negErr) throw negErr;

  const negocios: UserDetailNegocio[] = [];
  for (const n of negociosRows ?? []) {
    const extra = await computeNegocioExtra(n.id, n.tipo);
    negocios.push({
      id: n.id,
      nombre: n.nombre,
      tipo: n.tipo,
      isActive: n.is_active,
      createdAt: n.created_at,
      stats: extra.stats,
      ingresosTotales: extra.ingresosTotales,
    });
  }

  const profile: AdminProfile | null = profileRow
    ? {
        id: profileRow.id,
        email: profileRow.email,
        avatarUrl: profileRow.avatar_url ?? null,
        role: profileRow.role,
        plan: profileRow.plan,
        isBanned: profileRow.is_banned,
        createdAt: profileRow.created_at,
        negociosCount: negocios.length,
      }
    : null;

  return { profile, negocios };
}

export interface NegocioDetail extends AdminNegocio {
  stats: { label: string; value: number }[];
  ingresosTotales: number;
  ultimaActividad: string | null;
}

export async function fetchNegocioDetail(negocio: AdminNegocio): Promise<NegocioDetail> {
  const extra = await computeNegocioExtra(negocio.id, negocio.tipo);
  return { ...negocio, ...extra };
}

export async function deleteNegocio(negocioId: string): Promise<void> {
  const { error } = await supabase.from("negocios").delete().eq("id", negocioId);
  if (error) throw error;
}

export async function toggleNegocioActive(negocioId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("negocios").update({ is_active: isActive }).eq("id", negocioId);
  if (error) throw error;
}

/**
 * negocios.plan solo se puede tocar con service_role (ver el trigger
 * negocios_plan_owner_guard en supabase.sql) — un update directo desde
 * aquí con la sesión normal del admin tronaría, así que pasa por la ruta
 * /api/admin/negocios/[id] en vez de supabase.from("negocios").update(...).
 */
export async function updateNegocioPlan(negocioId: string, plan: PlanId): Promise<void> {
  const res = await fetch(`/api/admin/negocios/${negocioId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  const body = await parseJsonResponse(res);
  if (!res.ok) throw new Error(body.error ?? "No se pudo actualizar el plan.");
}

export async function changeNegocioOwner(negocioId: string, newOwnerId: string): Promise<void> {
  const { error } = await supabase.from("negocios").update({ owner_id: newOwnerId }).eq("id", negocioId);
  if (error) throw error;
}

export async function searchUsersByEmail(query: string): Promise<{ id: string; email: string | null }[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.from("profiles").select("id,email").ilike("email", `%${q}%`).limit(8);
  if (error) throw error;
  return data ?? [];
}

async function parseJsonResponse(res: Response): Promise<{ error?: string }> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** Borra la cuenta por completo (auth.users + cascada). Requiere service_role en el servidor. */
export async function deleteUserCompletely(userId: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
  const body = await parseJsonResponse(res);
  if (!res.ok) throw new Error(body.error ?? "No se pudo eliminar el usuario.");
}

/**
 * Cambia la sesión del navegador a la de este usuario ("ver como este
 * usuario"), server-side vía service_role — no manda a abrir un magic link
 * en una pestaña nueva (dos sesiones de Supabase no conviven en el mismo
 * navegador). Quien llama debe recargar por completo a /app después de que
 * esto resuelva (un router.push no basta: hay caches en memoria por
 * usuario en lib/session.ts que solo se limpian con una carga fresca).
 */
export async function impersonateUser(userId: string): Promise<void> {
  const res = await fetch("/api/admin/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await parseJsonResponse(res);
  if (!res.ok) throw new Error(body.error ?? "No se pudo generar el acceso.");
}

/** Sale de "ver como este usuario" y regresa la sesión del admin original. */
export async function exitImpersonation(): Promise<void> {
  const res = await fetch("/api/admin/impersonate/exit", { method: "POST" });
  const body = await parseJsonResponse(res);
  if (!res.ok) throw new Error(body.error ?? "No se pudo restaurar tu sesión.");
}

// ============================================================================
// Leads (cajita de contacto de la landing) — tab "Leads" de /admin.
// ============================================================================

export type LeadEstado = "nuevo" | "contactado" | "convertido";

export interface AdminLead {
  id: string;
  nombre: string;
  whatsapp: string;
  tipoNegocio: LeadTipoNegocio;
  mensaje: string | null;
  origen: string;
  estado: LeadEstado;
  createdAt: string;
}

export async function fetchLeads(): Promise<AdminLead[]> {
  const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((l) => ({
    id: l.id,
    nombre: l.nombre,
    whatsapp: l.whatsapp,
    tipoNegocio: l.tipo_negocio,
    mensaje: l.mensaje,
    origen: l.origen,
    estado: l.estado,
    createdAt: l.created_at,
  }));
}

export async function updateLeadEstado(leadId: string, estado: LeadEstado): Promise<void> {
  const { error } = await supabase.from("leads").update({ estado }).eq("id", leadId);
  if (error) throw error;
}

// ============================================================================
// Cumplimiento LFPDPPP (aviso de privacidad / derechos ARCO) — placeholder.
// El negocio de demo/piloto todavía no tiene un registro de consentimientos
// por cliente ni un flujo de solicitud ARCO; esto documenta el contrato que
// va a necesitar ese endpoint real (Ver consentimientos / Borrar datos ARCO
// en el modal de negocio) sin fingir que ya existe.
// ============================================================================

export async function prepareArcoRequest(_negocioId: string): Promise<{ ready: false; message: string }> {
  return {
    ready: false,
    message: "Consentimientos y solicitudes ARCO: función en preparación, todavía no hay endpoint real.",
  };
}
