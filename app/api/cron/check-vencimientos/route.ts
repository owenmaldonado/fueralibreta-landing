import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// Sin esto Next intenta pre-renderizar esta ruta como estática en build
// (no tiene segmentos dinámicos ni usa cookies()) y truena en build si
// SUPABASE_SERVICE_ROLE_KEY no está disponible en ese momento — este cron
// solo debe correr cuando Vercel Cron lo llama, nunca durante el build.
export const dynamic = "force-dynamic";

/**
 * Cron diario (Vercel Cron, ver vercel.json — "0 13 * * *", 7am hora de
 * Tepic) que reporta en los logs de Vercel qué negocios están vencidos o
 * por vencer, como respaldo de las tabs de cobranza de /admin.
 *
 * A propósito NO cambia nada en la base de datos (ni `plan`, ni
 * `is_active`, ni `trial_fin`):
 *
 * 1. El bloqueo del dueño YA es automático y en tiempo real —
 *    middleware.ts compara `trial_fin` contra hoy en cada request a
 *    /app/* y redirige a /planes-bloqueado si venció. Owen no tiene que
 *    "bloquear a mano" nada hoy; este cron no le agrega nada a eso.
 * 2. Bajar `plan` solo a 'basico' cuando vence rompería la política que ya
 *    se le prometió al dueño en /planes: "si no renuevas, tu negocio se
 *    bloquea pero NO se borra nada — pagas y vuelve todo intacto". El plan
 *    contratado (para saber cuánto renovar) solo lo cambia Owen a mano
 *    desde /admin, nunca un cron.
 * 3. No manda WhatsApp solo: no hay ninguna integración de envío
 *    automático en este proyecto, solo los links wa.me de 1 clic que abre
 *    el propio Owen (botón "Recordatorio" en /admin) — este cron deja el
 *    respaldo en logs, no sustituye ese clic.
 *
 * Protegido con CRON_SECRET (env var) — Vercel Cron manda
 * `Authorization: Bearer $CRON_SECRET` automáticamente si esa env existe;
 * sin ella configurada, la ruta queda abierta (útil para probar a mano),
 * así que hay que agregarla en producción.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("negocios")
    .select("id,nombre,trial_fin")
    .eq("is_active", true)
    .eq("es_fundador", false);

  if (error) {
    console.error("[check-vencimientos] no se pudo leer negocios:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const vencidos: { id: string; nombre: string; vence: string }[] = [];
  const porVencer: { id: string; nombre: string; vence: string }[] = [];

  for (const n of data ?? []) {
    const dias = Math.round((new Date(`${n.trial_fin}T00:00:00`).getTime() - hoy.getTime()) / 86400000);
    if (dias < 0) vencidos.push({ id: n.id, nombre: n.nombre, vence: n.trial_fin });
    else if (dias <= 3) porVencer.push({ id: n.id, nombre: n.nombre, vence: n.trial_fin });
  }

  console.log(
    `[check-vencimientos] ${vencidos.length} vencido(s), ${porVencer.length} por vencer (<=3d):`,
    JSON.stringify({ vencidos, porVencer })
  );

  return NextResponse.json({ ok: true, vencidos: vencidos.length, porVencer: porVencer.length });
}
