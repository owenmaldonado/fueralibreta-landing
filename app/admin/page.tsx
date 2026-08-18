import { redirect } from "next/navigation";

import { AdminPanel } from "@/components/admin/admin-panel";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { ADMIN_EMAIL } from "@/lib/admin-data";

// Depende de la sesión (cookies) en cada request: nunca debe quedar cacheada.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Doble candado a propósito: profiles.role="admin" es lo que ya usan las
  // policies "*_admin_all" de Supabase (RLS real, sin esto ninguna lectura
  // del panel funcionaría aunque se pasara este check), y el email exacto
  // es el candado explícito que pidió el negocio ("solo
  // owenxmaldonado100@gmail.com") — si algún día otra cuenta terminara con
  // role="admin" por error, este segundo check la sigue bloqueando.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" || user.email !== ADMIN_EMAIL) redirect("/");

  return <AdminPanel currentUserId={user.id} />;
}
