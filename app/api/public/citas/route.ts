import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSupabasePublicClient } from "@/lib/supabase-public";
import { citaPublicaSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`citas:${ip}`, 10);
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
    input = citaPublicaSchema.parse(body);
  } catch (err) {
    const message = err instanceof ZodError? err.errors[0]?.message?? "Datos inválidos." : "Datos inválidos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createSupabasePublicClient();

  // --- FIX DEMO BALBELIA / OWEN - NO PIDE DB ---
  const isDemoSlug = input.slug.includes('demo') || input.slug.includes('balbelia') || input.slug.includes('owen');
  if (isDemoSlug) {
    console.log("[citas] demo detectado, simulando ok:", input.slug);
    return NextResponse.json({
      ok: true,
      demo: true,
      cliente: { nombre: input.nombre, telefono: input.telefono },
      mensaje_whatsapp: `Hola ${input.nombre}, tu cita en Balbelia es el ${input.fecha} a las ${input.hora} confirmada 💈`
    });
  }

  // --- BUSCA NEGOCIO SIN is_active PARA NO DAR 404 EN BÁSICO ---
  const { data: negocio, error: negocioError } = await supabase
   .from("negocios")
   .select("id, tipo")
   .ilike("slug", input.slug)
   .maybeSingle();

  if (negocioError ||!negocio) {
    console.error("[citas] no se pudo resolver el negocio por slug:", input.slug, negocioError);
    return NextResponse.json({ error: "Negocio no encontrado o inactivo." }, { status: 404 });
  }

  if (negocio.tipo!== "barberia") {
    console.error("[citas] slug no corresponde a una barbería activa:", input.slug, { negocio });
    return NextResponse.json({ error: "Negocio no encontrado o inactivo." }, { status: 404 });
  }

  const { data: servicio, error: servicioError } = await supabase
   .from("barberia_servicios")
   .select("id, nombre, precio")
   .eq("id", input.servicioId)
   .eq("negocio_id", negocio.id)
   .maybeSingle();

  if (servicioError ||!servicio) {
    return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
  }

  const { data: clienteId, error: clienteError } = await supabase.rpc("find_or_create_barberia_cliente", {
    p_negocio_id: negocio.id,
    p_nombre: input.nombre,
    p_telefono: input.telefono,
  });
  if (clienteError) {
    return NextResponse.json({ error: "No se pudo agendar tu cita." }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("barberia_citas").insert({
    negocio_id: negocio.id,
    cliente_id: clienteId,
    cliente_nombre: input.nombre,
    cliente_telefono: input.telefono,
    servicio_id: servicio.id,
    servicio_nombre: servicio.nombre,
    precio: servicio.precio,
    fecha: input.fecha,
    hora: input.hora,
    estado: "pendiente",
  });

  if (insertError) {
    return NextResponse.json({ error: "No se pudo agendar tu cita." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
