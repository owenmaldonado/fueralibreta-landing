import { supabase } from "./supabase";
import type { BusinessType } from "./types";

// ============================================================================
// Datos del panel /admin. Todo esto corre con la sesión normal del admin
// (cliente en el navegador) apoyándose en las policies "*_admin_all" del
// esquema — no necesita la service_role key. Solo eliminar un usuario por
// completo e "impersonar" pegan a las rutas /api/admin/* que sí la usan.
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
  isActive: boolean;
  createdAt: string;
}

export interface AdminMetrics {
  totalUsuarios: number;
  totalNegocios: number;
  totalMovimientos: number;
  usuariosNuevosHoy: number;
}

export interface AdminOverview {
  profiles: AdminProfile[];
  negocios: AdminNegocio[];
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
    isActive: n.is_active,
    createdAt: n.created_at,
  }));

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const usuariosNuevosHoy = profiles.filter((p) => new Date(p.createdAt) >= hoy).length;

  return {
    profiles,
    negocios,
    metrics: {
      totalUsuarios: profiles.length,
      totalNegocios: negocios.length,
      totalMovimientos: (citasRes.count ?? 0) + (pedidosRes.count ?? 0) + (ventasRes.count ?? 0),
      usuariosNuevosHoy,
    },
  };
}

export async function updateUserRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw error;
}

export async function updateUserPlan(userId: string, plan: Plan): Promise<void> {
  const { error } = await supabase.from("profiles").update({ plan }).eq("id", userId);
  if (error) throw error;
}

export async function setUserBanned(userId: string, isBanned: boolean): Promise<void> {
  const { error } = await supabase.from("profiles").update({ is_banned: isBanned }).eq("id", userId);
  if (error) throw error;
}

export interface UserDetailNegocio {
  id: string;
  nombre: string;
  tipo: BusinessType;
  isActive: boolean;
  createdAt: string;
  stats: { label: string; value: number }[];
}

async function computeNegocioStats(negocioId: string, tipo: BusinessType): Promise<{ label: string; value: number }[]> {
  if (tipo === "barberia") {
    const [clientes, citas] = await Promise.all([
      supabase.from("barberia_clientes").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId),
      supabase.from("barberia_citas").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId),
    ]);
    return [
      { label: "Clientes", value: clientes.count ?? 0 },
      { label: "Citas", value: citas.count ?? 0 },
    ];
  }
  if (tipo === "fonda") {
    const pedidos = await supabase.from("fonda_pedidos").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId);
    return [{ label: "Pedidos", value: pedidos.count ?? 0 }];
  }
  const [productos, ventas] = await Promise.all([
    supabase.from("abarrotes_productos").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId),
    supabase.from("abarrotes_ventas").select("*", { count: "exact", head: true }).eq("negocio_id", negocioId),
  ]);
  return [
    { label: "Productos", value: productos.count ?? 0 },
    { label: "Ventas", value: ventas.count ?? 0 },
  ];
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
    negocios.push({
      id: n.id,
      nombre: n.nombre,
      tipo: n.tipo,
      isActive: n.is_active,
      createdAt: n.created_at,
      stats: await computeNegocioStats(n.id, n.tipo),
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
}

export async function fetchNegocioDetail(negocio: AdminNegocio): Promise<NegocioDetail> {
  return { ...negocio, stats: await computeNegocioStats(negocio.id, negocio.tipo) };
}

export async function deleteNegocio(negocioId: string): Promise<void> {
  const { error } = await supabase.from("negocios").delete().eq("id", negocioId);
  if (error) throw error;
}

export async function toggleNegocioActive(negocioId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("negocios").update({ is_active: isActive }).eq("id", negocioId);
  if (error) throw error;
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

async function parseJsonResponse(res: Response): Promise<{ error?: string; url?: string }> {
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

/** Genera un magic link para entrar como este usuario. Requiere service_role en el servidor. */
export async function impersonateUser(userId: string): Promise<string> {
  const res = await fetch(`/api/admin/users/${userId}/impersonate`, { method: "POST" });
  const body = await parseJsonResponse(res);
  if (!res.ok || !body.url) throw new Error(body.error ?? "No se pudo generar el acceso.");
  return body.url;
}
