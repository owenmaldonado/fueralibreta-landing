import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const isServiceRoleConfigured = Boolean(supabaseUrl && serviceRoleKey);

/**
 * Cliente con la service_role key: salta RLS por completo y puede usar
 * supabase.auth.admin.* (borrar usuarios de auth.users, generar links de
 * "ver como este usuario", etc). SOLO se importa desde Route Handlers, nunca
 * desde un componente cliente — el paquete "server-only" hace que el build
 * truene si algo del cliente intenta importar este archivo por error.
 */
export function createSupabaseAdminClient() {
  if (!isServiceRoleConfigured) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor."
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
