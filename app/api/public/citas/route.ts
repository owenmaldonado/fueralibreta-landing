import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSupabasePublicClient } from "@/lib/supabase-public";
import { citaPublicaSchema } from "@/lib/validation";

/**
 * Reserva pública de cita (/b/[slug]). Reemplaza al insert directo desde el
 * navegador para poder:
 *  1. Validar el body con zod (teléfono solo números, nombre sin < >, etc.)
 *  2. Confirmar que el slug corresponde a un negocio de tipo barbería ACTIVO
 *     antes de tocar nada — nunca confiamos en un negocio_id que mande el cliente.
 *  3. Limitar a 10 requests por minuto por IP.
 * RLS en `barberia_citas` (estado='pendiente' + negocio activo) sigue siendo
 * la última línea de defensa: esta ruta usa la anon key, no la service_role.
 *
 * Un negocio de DEMO (armado en /demo/[tipo], solo localStorage) nunca pasa
 * por aquí: /b/[slug]/page.tsx ya detecta ese caso ANTES de llamar a esta
 * ruta (readDemoPreview() por slug, ver `modoDemo` ahí) y guarda la cita
 * directo en el mismo localStorage con find-or-create de cliente local, sin
 * tocar la red — esta ruta solo existe para negocios reales.
 */
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
    const message = err instanceof ZodError ? err.errors[0]?.message ?? "Datos inválidos." : "Datos inválidos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createSupabasePublicClient();

  const { data: negocio, error: negocioError } = await supabase
    .from("negocios")
    .select("id, tipo")
    .eq("slug", input.slug)
    .eq("is_active", true)
    .maybeSingle();

  if (negocioError) {
    console.error("[citas] no se pudo resolver el negocio por slug:", input.slug, negocioError);
    return NextResponse.json({ error: "Negocio no encontrado o inactivo." }, { status: 404 });
  }
  if (!negocio || negocio.tipo !== "barberia") {
    console.error("[citas] slug no corresponde a una barbería activa:", input.slug, { negocio });
    return NextResponse.json({ error: "Negocio no encontrado o inactivo." }, { status: 404 });
  }

  const { data: servicio, error: servicioError } = await supabase
    .from("barberia_servicios")
    .select("id, nombre, precio")
    .eq("id", input.servicioId)
    .eq("negocio_id", negocio.id)
    .maybeSingle();

  if (servicioError || !servicio) {
    console.error("[citas] servicio no encontrado:", { negocioId: negocio.id, servicioId: input.servicioId, servicioError });
    return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
  }

  const { data: clienteId, error: clienteError } = await supabase.rpc("find_or_create_barberia_cliente", {
    p_negocio_id: negocio.id,
    p_nombre: input.nombre,
    p_telefono: input.telefono,
  });
  if (clienteError) {
    console.error("[citas] find_or_create_barberia_cliente falló:", {
      negocioId: negocio.id,
      nombre: input.nombre,
      telefono: input.telefono,
      message: clienteError.message,
      code: clienteError.code,
      details: clienteError.details,
      hint: clienteError.hint,
    });
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
    console.error("[citas] insert en barberia_citas falló:", {
      negocioId: negocio.id,
      fecha: input.fecha,
      hora: input.hora,
      message: insertError.message,
      code: insertError.code,
      details: insertError.details,
      hint: insertError.hint,
    });
    return NextResponse.json({ error: "No se pudo agendar tu cita." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
