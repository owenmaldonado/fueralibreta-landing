import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Genera un magic link de un solo uso para entrar como este usuario ("ver
 * como este usuario"). El cliente lo abre en una pestaña nueva, así el admin
 * no pierde su propia sesión. Requiere service_role (auth.admin.generateLink
 * no existe con la anon key).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error, status } = await requireAdminUser();
  if (!user) return NextResponse.json({ error }, { status });

  try {
    const admin = createSupabaseAdminClient();
    const { data: target, error: getError } = await admin.auth.admin.getUserById(params.id);
    if (getError || !target.user?.email) {
      return NextResponse.json({ error: "No se encontró ese usuario." }, { status: 404 });
    }

    const { data, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target.user.email,
    });
    if (linkError || !data.properties?.action_link) {
      throw linkError ?? new Error("No se pudo generar el link de acceso.");
    }

    return NextResponse.json({ url: data.properties.action_link });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo generar el acceso." },
      { status: 500 }
    );
  }
}
