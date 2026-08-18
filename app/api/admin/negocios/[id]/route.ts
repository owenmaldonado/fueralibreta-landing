import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

interface PatchBody {
  plan?: string;
  trial_fin?: string;
  trial_inicio?: string;
  precio_custom?: number | null;
  es_fundador?: boolean;
  notas_admin?: string | null;
  ultimo_pago_at?: string;
}

function esFechaValida(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

/**
 * Cambia plan / trial_fin / trial_inicio / precio_custom / es_fundador /
 * notas_admin / ultimo_pago_at de un negocio. Corre con service_role igual
 * que /api/admin/users/[id] — negocios_admin_all (RLS) ya le daría a un
 * admin acceso de escritura directo desde el cliente, pero el trigger
 * negocios_admin_fields_guard (supabase/migrations/20260815000000_esquema.sql y
 * 20260822000000_ultimo_pago.sql) SOLO deja tocar estas siete columnas
 * cuando la sesión corre como service_role, sin importar qué policy RLS
 * aplique — así que esta ruta es la ÚNICA forma real de cambiarlas, ni
 * siquiera un admin autenticado por su propia sesión puede hacerlo directo.
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
    if (!esFechaValida(body.trial_fin)) {
      return NextResponse.json({ error: "Fecha de fin de trial inválida." }, { status: 400 });
    }
    updates.trial_fin = body.trial_fin;
  }

  if (body.trial_inicio !== undefined) {
    if (!esFechaValida(body.trial_inicio)) {
      return NextResponse.json({ error: "Fecha de inicio de trial inválida." }, { status: 400 });
    }
    updates.trial_inicio = body.trial_inicio;
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

  if (body.notas_admin !== undefined) {
    if (body.notas_admin !== null && typeof body.notas_admin !== "string") {
      return NextResponse.json({ error: "Notas inválidas." }, { status: 400 });
    }
    updates.notas_admin = body.notas_admin;
  }

  if (body.ultimo_pago_at !== undefined) {
    if (!esFechaValida(body.ultimo_pago_at)) {
      return NextResponse.json({ error: "Fecha de último pago inválida." }, { status: 400 });
    }
    updates.ultimo_pago_at = body.ultimo_pago_at;
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

/**
 * Elimina un negocio y todo lo que cuelgue de él. Antes esto era un
 * supabase.from("negocios").delete() directo desde el cliente (ver
 * lib/admin-data.ts) — con la sesión normal del admin (no service_role) y
 * sin pasar primero por admin_delete_negocios_data(): cualquier tabla hija
 * cuya policy RLS no le diera permiso de DELETE al admin (la mayoría solo
 * dejan al propio dueño, vía is_negocio_owner()) bloqueaba el CASCADE a
 * medio camino y Postgres devolvía "violates foreign key constraint"
 * (409). Mismo arreglo que ya existe para el borrado de usuario completo
 * (ver DELETE en app/api/admin/users/[id]/route.ts): correr la limpieza
 * con service_role, que sí bypasea RLS en todas las tablas hijas.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error, status } = await requireAdminUser();
  if (!user) return NextResponse.json({ error }, { status });

  try {
    const admin = createSupabaseAdminClient();
    const { error: cleanupError } = await admin.rpc("admin_delete_negocios_data", { p_negocio_ids: [params.id] });
    if (cleanupError) throw cleanupError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("No se pudo eliminar el negocio:", params.id, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo eliminar el negocio." },
      { status: 500 }
    );
  }
}
