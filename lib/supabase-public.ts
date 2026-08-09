import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Cliente de Supabase para Route Handlers públicos (sin sesión de usuario):
 * usa la ANON key, así que sigue sujeto a las mismas policies de RLS que el
 * cliente del navegador — este archivo solo mueve la llamada al servidor
 * para poder validar el body y aplicar rate limit por IP antes de tocar la
 * base de datos. Nunca uses aquí la service_role key (eso es
 * lib/supabase-admin.ts, y solo para las dos acciones de /admin que de
 * verdad la necesitan).
 */
export function createSupabasePublicClient() {
  if (!isSupabaseConfigured) {
    throw new Error("Falta configurar Supabase (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
