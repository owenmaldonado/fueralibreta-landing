import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Elimina un usuario por completo de auth.users. Solo se puede hacer con la
 * service_role key (ver lib/supabase-admin.ts); las tablas de negocios,
 * profiles, etc. se limpian solas por los ON DELETE CASCADE del esquema.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error, status } = await requireAdminUser();
  if (!user) return NextResponse.json({ error }, { status });

  if (user.id === params.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta de admin." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(params.id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo eliminar el usuario." },
      { status: 500 }
    );
  }
}
