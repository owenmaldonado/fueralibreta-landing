import { redirect } from "next/navigation";

import { AdminHub } from "@/components/admin/admin-hub";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Hub de super admin: todas las apps/SaaS registradas en mis_apps, cada una
 * con sus estadísticas. Gateado server-side por profiles.role==='admin' —
 * el mismo chequeo real que usan /admin y /app/admin-dashboard.
 */
export default async function AdminHubPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  return <AdminHub />;
}
