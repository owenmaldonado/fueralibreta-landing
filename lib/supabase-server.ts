import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Cliente de Supabase para Server Components / Route Handlers. Lee la
 * sesión desde las cookies de la request (por eso solo funciona junto con
 * el refresco de sesión en middleware.ts). Úsalo solo en el servidor.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    supabaseUrl || "https://placeholder.supabase.co",
    supabaseAnonKey || "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Un Server Component no puede escribir cookies; middleware.ts
            // ya se encarga de refrescar la sesión en cada request.
          }
        },
      },
    }
  );
}
