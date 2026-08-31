import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSupabasePublicClient } from "@/lib/supabase-public";
import { createSupabaseAdminClient, isServiceRoleConfigured } from "@/lib/supabase-admin";
import { citaLookupSchema } from "@/lib/validation";

/**
 * "Ver mi cita" (/b/[slug]/cliente): busca citas pendientes por teléfono sin
 * login. Sin rate limit esto es un vector de enumeración — cualquiera podría
 * probar números al azar y leer nombre/hora de citas ajenas vía
 * get_citas_por_telefono (security definer). Con 10 req/min por IP se
 * vuelve impráctico hacer ese barrido.
 *
 * POR QUÉ EL RPC DE BÚSQUEDA VA CON service_role
 * El rate limit de arriba solo existe DENTRO de esta ruta. Mientras
 * `get_citas_por_telefono` estuviera abierta a `anon`, cualquiera podía
 * saltarse esta ruta y pegarle directo a /rest/v1/rpc/... con la llave
 * pública (que va en el navegador, es pública por diseño) — sin tope
 * ninguno. El límite decía "con 10 req/min se vuelve impráctico", y era
 * cierto por aquí, pero no por la puerta de al lado.
 *
 * Ahora esa función solo la puede ejecutar service_role, así que esta ruta
 * es el ÚNICO camino y el rate limit ya no se puede rodear.
 *
 * Que cambie el cliente no cambia qué datos se ven: las dos funciones son
 * `security definer`, o sea que ya corrían saltándose RLS. Lo único que
 * cambia es QUIÉN puede llamarlas.
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

  // RPC en vez de .from("negocios"): la policy de SELECT de esa tabla ya no
  // es pública (ver migración 20260913000001 — permitía bajarse la lista
  // completa de clientes con la anon key). La función recibe el slug y solo
  // devuelve campos de vitrina de negocios activos.
  const { data: negocios, error: negocioError } = await supabase.rpc("negocio_publico_por_slug", { p_slug: input.slug });
  const negocio = Array.isArray(negocios) ? negocios[0] : negocios;

  if (negocioError || !negocio) {
    return NextResponse.json({ error: "Negocio no encontrado o inactivo." }, { status: 404 });
  }

  // Si por lo que sea no hay service_role configurada, se sigue con el
  // cliente público en vez de tronar: una reserva que no se puede consultar
  // es peor que una consulta sin el candado extra. En producción sí está
  // (la usan /api/admin/* y el cron), así que el camino normal es el de
  // arriba.
  const paraBuscar = isServiceRoleConfigured ? createSupabaseAdminClient() : supabase;
  const { data, error } = await paraBuscar.rpc("get_citas_por_telefono", {
    p_negocio_id: negocio.id,
    p_telefono: input.telefono,
  });

  if (error) {
    return NextResponse.json({ error: "No se pudieron buscar tus citas." }, { status: 500 });
  }

  return NextResponse.json({ citas: data ?? [] });
}
