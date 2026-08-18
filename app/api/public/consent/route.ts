import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSupabasePublicClient } from "@/lib/supabase-public";
import { consentSchema } from "@/lib/validation";

/**
 * Prueba legal de consentimiento: <ConsentBanner /> le pega aquí cuando el
 * visitante acepta, además de guardar localStorage['fl-consent']. IP y
 * user agent solo se pueden leer del lado del servidor (el navegador no
 * expone la IP pública real), por eso esto vive en un Route Handler y no
 * en un insert directo desde el cliente.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`consent:${ip}`, 10);
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
    input = consentSchema.parse(body);
  } catch (err) {
    const message = err instanceof ZodError ? err.errors[0]?.message ?? "Datos inválidos." : "Datos inválidos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createSupabasePublicClient();
  const { error } = await supabase.from("consentimientos").insert({
    ip,
    user_agent: req.headers.get("user-agent") ?? null,
    acepto_terminos: input.acepto_terminos,
    acepto_privacidad: input.acepto_privacidad,
    acepto_cookies: input.acepto_cookies,
  });

  if (error) {
    return NextResponse.json({ error: "No se pudo guardar tu consentimiento." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
