import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSupabasePublicClient } from "@/lib/supabase-public";
import { contactoSchema } from "@/lib/validation";

/** Formulario de contacto de la landing (antes insertaba directo a Supabase desde el navegador). */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`contacto:${ip}`, 10);
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
    input = contactoSchema.parse(body);
  } catch (err) {
    const message = err instanceof ZodError ? err.errors[0]?.message ?? "Datos inválidos." : "Datos inválidos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createSupabasePublicClient();
  const { error } = await supabase.from("contactos").insert({
    nombre: input.nombre,
    telefono: input.telefono,
    negocio: input.negocio,
    mensaje: input.mensaje || null,
  });

  if (error) {
    return NextResponse.json({ error: "No se pudo enviar tu mensaje." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
