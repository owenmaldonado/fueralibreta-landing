import "server-only";

import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";

/**
 * Verifica en el servidor (nunca confíes en el cliente) que quien llama es
 * admin. La identidad ("quién eres") sí se lee de la sesión normal en
 * cookies, pero el rol se confirma con la service_role key en vez de
 * apoyarse en RLS — así ninguna ruta de /api/admin/* depende de que las
 * policies "*_admin_all" estén bien puestas para decidir quién entra. De
 * paso bloquea aquí mismo a un admin baneado (is_banned), que antes podía
 * seguir usando las rutas /api/admin/* aunque ya no pudiera ver el panel.
 */
export async function requireAdminUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, error: "No autenticado", status: 401 as const };
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, is_banned").eq("id", user.id).single();
  if (profile?.role !== "admin" || profile.is_banned) {
    return { user: null, error: "No autorizado", status: 403 as const };
  }

  return { user, error: null, status: 200 as const };
}
