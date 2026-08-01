import "server-only";

import { createSupabaseServerClient } from "./supabase-server";

/** Verifica en el servidor (nunca confíes en el cliente) que quien llama es admin. */
export async function requireAdminUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, error: "No autenticado", status: 401 as const };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return { user: null, error: "No autorizado", status: 403 as const };
  }

  return { user, error: null, status: 200 as const };
}
