import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSupabasePublicClient } from "@/lib/supabase-public";
import { citaLookupSchema } from "@/lib/validation";

/**
 * "Ver mi cita" (/b/[slug]/cliente): busca citas pendientes por teléfono sin
 * login. Sin rate limit esto es un vector de enumeración — cualquiera podría
 * probar números al azar y leer nombre/hora de citas ajenas vía
 * get_citas_por_telefono (security definer). Con 10 req/min por IP se
 * vuelve impráctico hacer ese barrido.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`citas-lookup:${ip}`, 10);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  let input;
  try {
    input = citaLookupSchema.parse(body);
  } catch (err) {
    const message = err instanceof ZodError ? err.errors[0]?.message ?? "Datos inválidos." : "Datos inválidos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createSupabasePublicClient();

  const { data: negocio, error: negocioError } = await supabase
    .from("negocios")
    .select("id")
    .eq("slug", input.slug)
    .eq("is_active", true)
    .maybeSingle();

  if (negocioError || !negocio) {
    return NextResponse.json({ error: "Negocio no encontrado o inactivo." }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("get_citas_por_telefono", {
    p_negocio_id: negocio.id,
    p_telefono: input.telefono,
  });

  if (error) {
    return NextResponse.json({ error: "No se pudieron buscar tus citas." }, { status: 500 });
  }

  return NextResponse.json({ citas: data ?? [] });
}
