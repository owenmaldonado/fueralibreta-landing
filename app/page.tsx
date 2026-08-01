import { App } from "@/components/app/app";
import { Landing } from "@/components/landing";
import { isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase-server";

// Lee cookies en cada request (supabase.auth.getUser()), así que nunca debe
// quedar cacheada como estática: si no, todos los visitantes verían la
// primera respuesta generada (landing o dashboard) sin importar su sesión.
export const dynamic = "force-dynamic";

// Decide en el servidor qué mostrar en fueralibreta.com: si hay sesión ya
// ve directo su sistema (<App />, filtrado por su user_id vía RLS), si no
// ve la landing pública (<Landing />) con el botón de "Inicia sesión".
export default async function HomePage() {
  if (!isSupabaseConfigured) {
    return <Landing />;
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? <App /> : <Landing />;
}
