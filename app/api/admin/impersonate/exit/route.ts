import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { IMPERSONATION_COOKIE, readImpersonationCookie } from "@/lib/impersonation";

/**
 * Vuelve de "ver como este usuario" a la sesión del admin original. La
 * sesión ACTIVA en este momento es la del usuario impersonado (no admin),
 * así que no se puede usar requireAdminUser() aquí — en su lugar se confía
 * únicamente en la cookie firmada admin_impersonating (su HMAC ya garantiza
 * que nadie pudo fabricarla) para saber a quién restaurar, y se re-confirma
 * con service_role que ese admin original SIGUE siendo admin (pudo haber
 * sido degradado o baneado mientras impersonaba) antes de restaurar nada.
 */
export async function POST() {
  const cookieStore = cookies();
  const payload = readImpersonationCookie(cookieStore.get(IMPERSONATION_COOKIE)?.value);
  if (!payload) {
    cookieStore.delete(IMPERSONATION_COOKIE);
    return NextResponse.json({ error: "No hay una sesión de impersonación activa." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("role, is_banned")
      .eq("id", payload.adminId)
      .single();
    if (!adminProfile || adminProfile.role !== "admin" || adminProfile.is_banned) {
      cookieStore.delete(IMPERSONATION_COOKIE);
      return NextResponse.json({ error: "Tu cuenta de admin ya no tiene acceso." }, { status: 403 });
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: payload.adminEmail,
    });
    if (linkError || !linkData.properties?.hashed_token) {
      throw linkError ?? new Error("No se pudo restaurar tu sesión.");
    }

    const supabase = createSupabaseServerClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError) throw verifyError;

    cookieStore.delete(IMPERSONATION_COOKIE);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("No se pudo restaurar la sesión del admin:", payload.adminId, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo restaurar tu sesión." },
      { status: 500 }
    );
  }
}
