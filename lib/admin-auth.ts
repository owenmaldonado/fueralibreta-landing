import "server-only";

import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { ADMIN_EMAIL } from "./admin-data";

/**
 * Verifica en el servidor (nunca confíes en el cliente) que quien llama es
 * admin. La identidad ("quién eres") sí se lee de la sesión normal en
 * cookies, pero el rol se confirma con la service_role key en vez de
 * apoyarse en RLS — así ninguna ruta de /api/admin/* depende de que las
 * policies "*_admin_all" estén bien puestas para decidir quién entra. De
 * paso bloquea aquí mismo a un admin baneado (is_banned), que antes podía
 * seguir usando las rutas /api/admin/* aunque ya no pudiera ver el panel.
 *
 * El check de ADMIN_EMAIL es un segundo candado explícito ("solo
 * owenxmaldonado100@gmail.com") además de profiles.role — si algún día otra
 * cuenta terminara con role='admin' por error (o un admin cambia su propio
 * email en Supabase Auth sin querer perder el acceso), esto la sigue
 * bloqueando aquí, en el único lugar que de verdad importa: donde se
 * ejecutan los cambios con service_role.
 */
export async function requireAdminUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, error: "No autenticado", status: 401 as const };
  }
  if (!ADMIN_EMAIL) {
    console.error("ADMIN_EMAIL missing");
    return { user: null, error: "Configuración de servidor incompleta: falta ADMIN_EMAIL.", status: 500 as const };
  }
  if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { user: null, error: "No autorizado", status: 403 as const };
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, is_banned").eq("id", user.id).single();
  if (profile?.is_banned) {
    return { user: null, error: "No autorizado", status: 403 as const };
  }
  if (profile?.role !== "admin") {
    return { user: null, error: `No es admin, role actual: ${profile?.role ?? "desconocido"}`, status: 403 as const };
  }

  return { user, error: null, status: 200 as const };
}
