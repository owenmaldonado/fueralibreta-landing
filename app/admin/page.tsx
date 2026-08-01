import { redirect } from "next/navigation";

import { AdminPanel } from "@/components/admin/admin-panel";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase-server";

// Depende de la sesión (cookies) en cada request: nunca debe quedar cacheada.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  return <AdminPanel currentUserId={user.id} />;
}
