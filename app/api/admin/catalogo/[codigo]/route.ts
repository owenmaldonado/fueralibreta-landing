import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

interface PatchBody {
  nombre?: string;
  marca?: string | null;
  presentacion?: string | null;
}

/**
 * Editar una entrada del catálogo global (ver
 * supabase/migrations/20260815010000_catalogo_global.sql). Aunque
 * catalogo_global_admin_all (RLS) ya le daría a un admin autenticado
 * acceso de escritura directo desde el cliente, esta ruta corre con
 * service_role igual que /api/admin/negocios/[id] — mismo patrón que el
 * resto de /api/admin/*, no depende de que RLS esté bien puesta.
 */
export async function PATCH(req: Request, { params }: { params: { codigo: string } }) {
  const { user, error, status } = await requireAdminUser();
  if (!user) return NextResponse.json({ error }, { status });

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.nombre !== undefined) {
    if (typeof body.nombre !== "string" || body.nombre.trim().length === 0) {
      return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
    }
    updates.nombre = body.nombre.trim();
  }
  if (body.marca !== undefined) {
    updates.marca = body.marca?.trim() || null;
  }
  if (body.presentacion !== undefined) {
    updates.presentacion = body.presentacion?.trim() || null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error: updateError } = await admin.from("catalogo_global").update(updates).eq("codigo_barras", params.codigo);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("No se pudo actualizar el catálogo global:", params.codigo, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo actualizar." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { codigo: string } }) {
  const { user, error, status } = await requireAdminUser();
  if (!user) return NextResponse.json({ error }, { status });

  try {
    const admin = createSupabaseAdminClient();
    const { error: deleteError } = await admin.from("catalogo_global").delete().eq("codigo_barras", params.codigo);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("No se pudo borrar del catálogo global:", params.codigo, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo borrar." },
      { status: 500 }
    );
  }
}
