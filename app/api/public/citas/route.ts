import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSupabasePublicClient } from "@/lib/supabase-public";
import { citaPublicaSchema } from "@/lib/validation";
import { getAvailableSlotsForDuracion } from "@/lib/agenda";
import type { Appointment, HorarioDia } from "@/lib/types";

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

  // RPC en vez de .from("negocios"): la policy de SELECT de esa tabla ya no
  // es pública (ver migración 20260913000001 — permitía bajarse la lista
  // completa de clientes con la anon key). La función recibe el slug y solo
  // devuelve campos de vitrina de negocios activos, incluidos los tres que
  // hacían falta aquí: id, tipo y timezone.
  const { data: negocios, error: negocioError } = await supabase.rpc("negocio_publico_por_slug", { p_slug: input.slug });
  const negocio = Array.isArray(negocios) ? negocios[0] : negocios;

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
    .select("id, nombre, precio, duracion_min")
    .eq("id", input.servicioId)
    .eq("negocio_id", negocio.id)
    .maybeSingle();

  if (servicioError || !servicio) {
    console.error("[citas] servicio no encontrado:", { negocioId: negocio.id, servicioId: input.servicioId, servicioError });
    return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
  }

  // El picker del cliente (/b/[slug]) ya solo ofrece huecos donde el
  // servicio completo cabe (getAvailableSlotsForDuracion, lib/agenda.ts),
  // pero un cliente desactualizado o dos personas reservando el mismo
  // hueco a la vez podrían mandar una hora que ya no alcanza — se
  // recalcula aquí, del lado del servidor, antes de insertar.
  const [horarioRes, excepcionesRes, todosServiciosRes, citasDelDiaRes] = await Promise.all([
    supabase.from("barberia_horario").select("*").eq("negocio_id", negocio.id),
    supabase.from("barberia_excepciones").select("*").eq("negocio_id", negocio.id),
    supabase.from("barberia_servicios").select("id, nombre, precio, duracion_min").eq("negocio_id", negocio.id),
    supabase
      .from("barberia_citas_publicas")
      .select("fecha, hora, estado, servicio_id")
      .eq("negocio_id", negocio.id)
      .eq("fecha", input.fecha),
  ]);
  for (const r of [horarioRes, excepcionesRes, todosServiciosRes, citasDelDiaRes]) {
    if (r.error) {
      console.error("[citas] no se pudo validar disponibilidad:", r.error);
      return NextResponse.json({ error: "No se pudo agendar tu cita." }, { status: 500 });
    }
  }
  const slotSource = {
    horario: (horarioRes.data ?? []).map((h) => ({
      dia: h.dia as HorarioDia["dia"],
      abierto: h.abierto as boolean,
      inicio: (h.inicio as string).slice(0, 5),
      fin: (h.fin as string).slice(0, 5),
      comidaInicio: h.comida_inicio ? (h.comida_inicio as string).slice(0, 5) : undefined,
      comidaFin: h.comida_fin ? (h.comida_fin as string).slice(0, 5) : undefined,
    })),
    excepciones: (excepcionesRes.data ?? []).map((e) => ({
      id: e.id as string,
      fecha: e.fecha as string,
      etiqueta: e.etiqueta as string,
      cerrado: e.cerrado as boolean,
      horaEspecialFin: e.hora_especial_fin ? (e.hora_especial_fin as string).slice(0, 5) : undefined,
    })),
    servicios: (todosServiciosRes.data ?? []).map((s) => ({
      id: s.id as string,
      nombre: s.nombre as string,
      precio: Number(s.precio),
      duracion_min: s.duracion_min as number,
    })),
    citas: (citasDelDiaRes.data ?? []).map((c) => ({
      fecha: c.fecha as string,
      hora: (c.hora as string).slice(0, 5),
      estado: c.estado as Appointment["estado"],
      servicioId: c.servicio_id as string,
    })),
  };
  const huecosValidos = getAvailableSlotsForDuracion(slotSource, input.fecha, servicio.duracion_min, negocio.timezone ?? undefined);
  if (!huecosValidos.includes(input.hora)) {
    return NextResponse.json({ error: "Ese horario ya no está disponible, elige otro." }, { status: 409 });
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
    // Dos personas apartando el MISMO hueco en el mismo instante: la
    // revalidación de arriba las dejó pasar a las dos (entre "consulté" y
    // "guardé" siempre hay una rendija), y el índice único de la base
    // rechaza a la segunda. Gana quien llegó primero; a la otra se le
    // responde lo mismo que cuando el horario ya estaba ocupado desde
    // antes — 409 y un mensaje que dice qué pasó, no un 500 de "algo
    // salió mal" que la deja sin saber si su cita quedó o no.
    if (insertError.code === "23505") {
      console.warn("[citas] choque de horario, alguien apartó primero:", { negocioId: negocio.id, fecha: input.fecha, hora: input.hora });
      return NextResponse.json(
        { error: "Alguien apartó ese horario justo antes que tú. Elige otro, por favor." },
        { status: 409 }
      );
    }
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
