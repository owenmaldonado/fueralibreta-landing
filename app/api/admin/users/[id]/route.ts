import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Cambia rol/plan/baneo de un usuario. Antes esto lo hacía el cliente
 * directo (supabase.from("profiles").update(...)) apoyado solo en la
 * policy "profiles_admin_all" (is_admin()) — funcionaba, pero dependía por
 * completo de que esa policy siguiera bien puesta. Pasa por aquí en vez de
 * eso: requireAdminUser() ya verifica is_admin con la service_role key
 * (bypassa RLS), y la actualización también corre con service_role — no
 * depende de RLS en ningún punto del camino.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error, status } = await requireAdminUser();
  console.log("Admin check [PATCH /api/admin/users]", { targetId: params.id, ok: Boolean(user), error, status });
  if (!user) return NextResponse.json({ error }, { status });

  let body: { role?: string; plan?: string; is_banned?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const cambios: Record<string, string | boolean> = {};
  if (body.role !== undefined) {
    if (body.role !== "admin" && body.role !== "user") {
      return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
    }
    if (body.role === "user" && user.id === params.id) {
      return NextResponse.json({ error: "No puedes quitarte tu propio rol de admin." }, { status: 400 });
    }
    cambios.role = body.role;
  }
  if (body.plan !== undefined) {
    if (body.plan !== "free" && body.plan !== "pro") {
      return NextResponse.json({ error: "Plan inválido." }, { status: 400 });
    }
    cambios.plan = body.plan;
  }
  if (body.is_banned !== undefined) {
    if (typeof body.is_banned !== "boolean") {
      return NextResponse.json({ error: "is_banned inválido." }, { status: 400 });
    }
    if (body.is_banned && user.id === params.id) {
      return NextResponse.json({ error: "No puedes banearte a ti mismo." }, { status: 400 });
    }
    cambios.is_banned = body.is_banned;
  }
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error: updateError } = await admin.from("profiles").update(cambios).eq("id", params.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("No se pudo actualizar el usuario:", params.id, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo actualizar el usuario." },
      { status: 500 }
    );
  }
}

/**
 * Elimina un usuario por completo: primero limpia todo lo que cuelgue de
 * cada uno de sus negocios (tabla por tabla, vía admin_delete_negocios_data()
 * en supabase/migrations/20260815000000_esquema.sql — ver ahí por qué no se hardcodean nombres de tabla ni se
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
  console.log("Admin check [DELETE /api/admin/users]", { targetId: params.id, ok: Boolean(user), error, status });
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
