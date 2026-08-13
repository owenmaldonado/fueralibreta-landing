import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { IMPERSONATION_COOKIE, createImpersonationCookie } from "@/lib/impersonation";

/**
 * "Ver como este usuario" real: en vez de generar un magic link para abrir
 * en una pestaña nueva (dos sesiones de Supabase no pueden convivir en el
 * mismo navegador — comparten las mismas cookies, así que la pestaña nueva
 * terminaba compitiendo con la del admin y el server-render de "/" ganaba la
 * carrera con la sesión vieja, aterrizando de vuelta en el hub del admin),
 * esto canjea el link server-side (generateLink + verifyOtp con
 * token_hash) y reemplaza la sesión del admin por la del usuario objetivo
 * DIRECTO en las cookies de esta respuesta. El navegador queda logueado de
 * verdad como ese usuario — /app carga sus negocios porque auth.uid() ya es
 * el suyo, sin tocar ninguna policy de RLS.
 *
 * Antes de pisar la sesión, guarda quién eras en una cookie firmada
 * (admin_impersonating) para poder volver con /api/admin/impersonate/exit.
 */
export async function POST(req: Request) {
  const { user: adminUser, error, status } = await requireAdminUser();
  if (!adminUser) return NextResponse.json({ error }, { status });

  let targetId: string | undefined;
  try {
    const body = await req.json();
    targetId = typeof body?.user_id === "string" ? body.user_id : undefined;
  } catch {
    // body vacío/no-JSON: targetId se queda undefined y cae al 400 de abajo
  }
  if (!targetId) {
    return NextResponse.json({ error: "Falta user_id." }, { status: 400 });
  }
  if (targetId === adminUser.id) {
    return NextResponse.json({ error: "Ya eres tú." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: target, error: getError } = await admin.auth.admin.getUserById(targetId);
    if (getError || !target.user?.email) {
      return NextResponse.json({ error: "No se encontró ese usuario." }, { status: 404 });
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target.user.email,
    });
    if (linkError || !linkData.properties?.hashed_token) {
      throw linkError ?? new Error("No se pudo generar el acceso.");
    }

    const supabase = createSupabaseServerClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError) throw verifyError;

    cookies().set(
      IMPERSONATION_COOKIE,
      createImpersonationCookie({
        adminId: adminUser.id,
        adminEmail: adminUser.email ?? "",
        targetId,
        targetEmail: target.user.email,
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 2 * 60 * 60,
      }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("No se pudo impersonar al usuario:", targetId, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo generar el acceso." },
      { status: 500 }
    );
  }
}
