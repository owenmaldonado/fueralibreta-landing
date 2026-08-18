import "server-only";

import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { ADMIN_EMAIL } from "./admin-data";

export async function requireAdminUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { error: "No autenticado", status: 401 } as const;
  }

  const expectedEmail = ADMIN_EMAIL.toLowerCase().trim();
  const actualEmail = user.email.toLowerCase().trim();

  if (actualEmail !== expectedEmail) {
    console.error("ADMIN_EMAIL mismatch", { actualEmail, expectedEmail });
    return { error: "No es admin", status: 403 } as const;
  }

  const supabaseAdmin = createSupabaseAdminClient();

  // Intenta por ID
  let { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .single();

  // Fallback por email + auto-repair
  if (!profile) {
    const { data: byEmail } = await supabaseAdmin
      .from("profiles")
      .select("id, email, role")
      .eq("email", actualEmail)
      .single();

    if (byEmail) {
      // Repara el ID huérfano
      await supabaseAdmin.from("profiles").update({ id: user.id }).eq("email", actualEmail);
      profile = byEmail;
      console.log("Perfil reparado por email", byEmail);
    }
  }

  const role = (profile as any)?.role || "desconocido";
  console.log("Admin check", { userId: user.id, email: actualEmail, role, profileId: (profile as any)?.id });

  if (role !== "admin") {
    return { error: `No es admin, role actual: ${role}`, status: 403 } as const;
  }

  return { user, supabaseAdmin, profile };
}
