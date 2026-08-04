import { redirect } from "next/navigation";

import { App } from "@/components/app/app";
import { Landing } from "@/components/landing";
import { isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase-server";

// Lee cookies en cada request (supabase.auth.getUser()), así que nunca debe
// quedar cacheada como estática: si no, todos los visitantes verían la
// primera respuesta generada (landing o dashboard) sin importar su sesión.
export const dynamic = "force-dynamic";

// Decide en el servidor qué mostrar en fueralibreta.com: si hay sesión ya
// ve directo su sistema (<App />, filtrado por su user_id vía RLS), si no
// ve la landing pública (<Landing />) con el botón de "Inicia sesión". Si
// además es admin (profiles.role, el mismo chequeo real que usa /admin), lo
// mandamos directo a /admin en vez de al dashboard de un negocio.
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
  if (profile?.role === "admin") redirect("/admin");

  return <App />;
}
