import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Elimina un usuario por completo: primero limpia todo lo que cuelgue de
 * cada uno de sus negocios (tabla por tabla, vía admin_delete_negocios_data()
 * en supabase.sql — ver ahí por qué no se hardcodean nombres de tabla ni se
 * confía solo en ON DELETE CASCADE) y las filas de negocios, y al final
 * borra la fila de auth.users. Antes esto dependía completamente de que el
 * CASCADE limpiara todo al borrar auth.users: si una sola tabla con
 * negocio_id no existía en este proyecto de Supabase (o le faltaba el
 * CASCADE), auth.admin.deleteUser() tronaba entero con un 500 genérico,
 * bloqueando el borrado de cualquier usuario con 2+ negocios si uno solo
 * tenía el problema.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error, status } = await requireAdminUser();
  if (!user) return NextResponse.json({ error }, { status });

  if (user.id === params.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta de admin." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  try {
    const { data: negocios, error: negociosError } = await admin
      .from("negocios")
      .select("id")
      .eq("owner_id", params.id);
    if (negociosError) throw negociosError;

    const negocioIds = (negocios ?? []).map((n) => n.id as string);

    if (negocioIds.length > 0) {
      const { error: cleanupError } = await admin.rpc("admin_delete_negocios_data", { p_negocio_ids: negocioIds });
      if (cleanupError) throw cleanupError;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(params.id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true, negociosEliminados: negocioIds.length });
  } catch (err) {
    console.error("No se pudo eliminar el usuario:", params.id, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo eliminar el usuario." },
      { status: 500 }
    );
  }
}
