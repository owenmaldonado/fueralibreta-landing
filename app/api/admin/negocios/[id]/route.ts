import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

interface PatchBody {
  plan?: string;
  trial_fin?: string;
  precio_custom?: number | null;
  es_fundador?: boolean;
}

/**
 * Cambia plan / trial_fin / precio_custom / es_fundador de un negocio.
 * Corre con service_role igual que /api/admin/users/[id] — negocios_admin_all
 * (RLS) ya le daría a un admin acceso de escritura directo desde el cliente,
 * pero el trigger negocios_admin_fields_guard (supabase.sql) SOLO deja tocar
 * estas cuatro columnas cuando la sesión corre como service_role, sin
 * importar qué policy RLS aplique — así que esta ruta es la ÚNICA forma real
 * de cambiarlas, ni siquiera un admin autenticado por su propia sesión puede
 * hacerlo directo.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error, status } = await requireAdminUser();
  if (!user) return NextResponse.json({ error }, { status });

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.plan !== undefined) {
    if (body.plan !== "basico" && body.plan !== "pro" && body.plan !== "pro_plus") {
      return NextResponse.json({ error: "Plan inválido." }, { status: 400 });
    }
    updates.plan = body.plan;
  }

  if (body.trial_fin !== undefined) {
    if (typeof body.trial_fin !== "string" || Number.isNaN(Date.parse(body.trial_fin))) {
      return NextResponse.json({ error: "Fecha de trial inválida." }, { status: 400 });
    }
    updates.trial_fin = body.trial_fin;
  }

  if (body.precio_custom !== undefined) {
    if (body.precio_custom !== null && (typeof body.precio_custom !== "number" || !Number.isFinite(body.precio_custom) || body.precio_custom < 0)) {
      return NextResponse.json({ error: "Precio custom inválido." }, { status: 400 });
    }
    updates.precio_custom = body.precio_custom;
  }

  if (body.es_fundador !== undefined) {
    if (typeof body.es_fundador !== "boolean") {
      return NextResponse.json({ error: "Valor de fundador inválido." }, { status: 400 });
    }
    updates.es_fundador = body.es_fundador;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error: updateError } = await admin.from("negocios").update(updates).eq("id", params.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("No se pudo actualizar el negocio:", params.id, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo actualizar el negocio." },
      { status: 500 }
    );
  }
}
