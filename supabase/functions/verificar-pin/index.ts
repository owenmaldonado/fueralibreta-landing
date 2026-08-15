// Edge Function: verificar-pin
//
// Valida el PIN de 4 dígitos de un empleado (modo PIN, sin cuenta propia —
// ver negocio_empleados en supabase.sql y lib/empleados.ts) contra su
// pin_hash (bcrypt vía pgcrypto), registra el intento en auditoria_pin, y
// si es correcto regresa los datos del empleado para que el front guarde
// "quién está atendiendo" en la cookie fl_empleado.
//
// Corre con la service_role key (nunca expuesta al cliente) precisamente
// para que la verificación de PIN NO dependa de que el navegador siga
// teniendo una sesión de Supabase válida — el tablet/cel compartido de la
// tienda ya está logueado como el dueño (Google, sesión persistente), pero
// esta función es independiente de eso: seguiría funcionando aunque esa
// sesión expirara a medio turno.
//
// Deploy: supabase functions deploy verificar-pin
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen automáticamente
// como env vars en el runtime de Edge Functions, no hay que configurarlas.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerificarPinBody {
  negocio_id?: string;
  empleado_id?: string;
  pin?: string;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let body: VerificarPinBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "bad_request" }, 400);
  }

  const { negocio_id, empleado_id, pin } = body;

  // Validación de forma antes de tocar la base de datos: un PIN que no son
  // 4 dígitos nunca puede ser válido, no hace falta ni consultar ni
  // registrar el intento.
  if (!negocio_id || !empleado_id || !pin || !/^\d{4}$/.test(pin)) {
    return jsonResponse({ error: "bad_request" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // verificar_pin_empleado (security definer, ver supabase.sql) hace el
  // crypt(pin, pin_hash) adentro de Postgres — el hash nunca sale de la
  // base de datos ni pasa por esta función en texto plano.
  const { data, error } = await supabase.rpc("verificar_pin_empleado", {
    p_negocio_id: negocio_id,
    p_empleado_id: empleado_id,
    p_pin: pin,
  });

  const empleado = !error && data && data.length > 0 ? data[0] : null;

  await supabase.from("auditoria_pin").insert({
    negocio_id,
    empleado_id_intentado: empleado_id,
    exito: Boolean(empleado),
    motivo: empleado ? "pin_correcto" : error ? "error_verificacion" : "pin_incorrecto",
  });

  if (!empleado) {
    return jsonResponse({ error: "pin_invalido" }, 401);
  }

  return jsonResponse(
    { empleado_id: empleado.id, nombre: empleado.nombre, rol: empleado.rol, user_id: empleado.user_id },
    200
  );
});
