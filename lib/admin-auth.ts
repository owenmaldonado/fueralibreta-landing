import "server-only";
import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { ADMIN_EMAIL } from "./admin-data";

export async function requireAdminUser() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { user: null, error: "No autenticado", status: 401 as const };

  const actualEmail = user.email?.toLowerCase().trim()?? "";
  const allowedEmail = ADMIN_EMAIL.toLowerCase().trim();
  if (actualEmail!== allowedEmail) {
    return { user: null, error: "No autorizado", status: 403 as const };
  }

  const admin = createSupabaseAdminClient();

  // 1. Busca por ID primero
  const { data: byId, error: errId } = await admin
   .from("profiles")
   .select("id, email, role, is_banned")
   .eq("id", user.id);

  console.log("Admin check byId", { userId: user.id, byId, errId });

  let profile = byId?.[0]?? null;

  // 2. Si no hay por ID, busca por email
  if (!profile) {
    const { data: byEmail, error: errEmail } = await admin
     .from("profiles")
     .select("id, email, role, is_banned")
     .ilike("email", actualEmail);

    console.log("Admin check byEmail", { byEmail, errEmail });

    // Toma cualquiera que sea admin, aunque haya 2
    profile = (byEmail?.find(r => r.role === 'admin')?? byEmail?.[0]?? null) as any;
  }

  console.log("Admin check final", {
    userId: user.id,
    email: actualEmail,
    role: profile?.role?? null,
    profileId: profile?.id?? null,
  });

  if (profile?.is_banned) return { user: null, error: "No autorizado", status: 403 as const };
  if (profile?.role!== "admin") {
    return { user: null, error: `No es admin, role actual: ${profile?.role?? "desconocido"}`, status: 403 as const };
  }

  return { user, error: null, status: 200 as const };
}
