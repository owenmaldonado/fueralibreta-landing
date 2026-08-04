import { redirect } from "next/navigation";

import { Landing } from "@/components/landing";
import { isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase-server";

// Lee cookies en cada request (supabase.auth.getUser()), así que nunca debe
// quedar cacheada como estática: si no, todos los visitantes verían la
// primera respuesta generada (landing o dashboard) sin importar su sesión.
export const dynamic = "force-dynamic";

// Decide en el servidor qué mostrar en fueralibreta.com: si no hay sesión,
// la landing pública (<Landing />) con los botones de login. Si hay sesión,
// manda al destino correcto según profiles.role (el mismo chequeo real que
// usa /admin): admin -> /app/admin-dashboard, cliente normal -> /app/inicio
// (o /onboarding si todavía no tiene negocio, eso lo resuelve esa misma ruta).
export default async function HomePage() {
  if (!isSupabaseConfigured) {
    return <Landing />;
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <Landing />;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  redirect(profile?.role === "admin" ? "/app/admin-dashboard" : "/app/inicio");
}
