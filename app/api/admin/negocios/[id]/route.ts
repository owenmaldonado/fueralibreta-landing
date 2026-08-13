import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Cambia el plan (básico/pro/pro_plus) de un negocio. Corre con
 * service_role igual que /api/admin/users/[id] — negocios_admin_all (RLS)
 * ya le daría a un admin acceso de escritura directo desde el cliente,
 * pero el trigger negocios_plan_owner_guard (supabase.sql) SOLO deja tocar
 * la columna plan cuando la sesión corre como service_role, sin importar
 * qué policy RLS aplique — así que esta ruta es la ÚNICA forma real de
 * cambiar el plan de un negocio, ni siquiera un admin autenticado por su
 * propia sesión puede hacerlo directo.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error, status } = await requireAdminUser();
  if (!user) return NextResponse.json({ error }, { status });

  let body: { plan?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  if (body.plan !== "basico" && body.plan !== "pro" && body.plan !== "pro_plus") {
    return NextResponse.json({ error: "Plan inválido." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error: updateError } = await admin.from("negocios").update({ plan: body.plan }).eq("id", params.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("No se pudo actualizar el plan del negocio:", params.id, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo actualizar el plan." },
      { status: 500 }
    );
  }
}
