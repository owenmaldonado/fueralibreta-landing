import "server-only";

import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { ADMIN_EMAIL } from "./admin-data";

type ProfileRow = { id: string; email: string | null; role: string; is_banned: boolean };

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
 *
 * profiles.id es FK a auth.users(id) on delete cascade, así que una fila
 * "huérfana" (id que no matchea auth.uid() pero mismo email) solo puede
 * pasar si hay dos filas en auth.users con el mismo email (dos altas,
 * p. ej. password + Google sin auto-link) — no por corrupción de datos. El
 * fallback por email de abajo cubre ese caso SIN tocar ningún id: usa
 * .select() en vez de .single() (que truena con 0 o 2+ filas) y, si hay
 * varias filas para el mismo email, se queda con la que ya sea role='admin'
 * en vez de adivinar o reescribir primary keys en caliente.
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

  const actualEmail = user.email?.toLowerCase().trim() ?? "";
  if (actualEmail !== ADMIN_EMAIL.toLowerCase().trim()) {
    return { user: null, error: "No autorizado", status: 403 as const };
  }

  const admin = createSupabaseAdminClient();

  const { data: byId } = await admin.from("profiles").select("id, email, role, is_banned").eq("id", user.id);
  let profile: ProfileRow | null = (byId?.[0] as ProfileRow | undefined) ?? null;

  if (!profile) {
    const { data: byEmail } = await admin
      .from("profiles")
      .select("id, email, role, is_banned")
      .ilike("email", actualEmail);
    const rows = (byEmail ?? []) as ProfileRow[];
    const adminRows = rows.filter((r) => r.role === "admin");

    if (adminRows.length === 1) {
      profile = adminRows[0];
    }

    if (rows.length > 1) {
      console.error("Admin check: profiles duplicados para el mismo email (revisa auth.users por cuentas duplicadas)", {
        email: actualEmail,
        filas: rows.map((r) => ({ id: r.id, role: r.role })),
        filaUsada: profile?.id ?? null,
      });
    }
  }

  console.log("Admin check", {
    userId: user.id,
    email: actualEmail,
    role: profile?.role ?? null,
    profileId: profile?.id ?? null,
  });

  if (profile?.is_banned) {
    return { user: null, error: "No autorizado", status: 403 as const };
  }
  if (profile?.role !== "admin") {
    return { user: null, error: `No es admin, role actual: ${profile?.role ?? "desconocido"}`, status: 403 as const };
  }

  return { user, error: null, status: 200 as const };
}
