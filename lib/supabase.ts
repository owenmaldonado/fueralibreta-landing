import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Se crea el cliente aunque falten las variables de entorno para que el
// build no truene; las pantallas validan isSupabaseConfigured antes de usarlo.
//
// createBrowserClient (en vez de createClient de @supabase/supabase-js a
// secas) guarda la sesión en cookies en lugar de localStorage, para que el
// Server Component de app/page.tsx pueda leer al usuario logueado con
// supabase.auth.getUser() en el servidor.
export const supabase = createBrowserClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
