import { supabase } from "./supabase";
import type { EmpleadoActual, RolEmpleado } from "./types";

/**
 * Multiusuario (modo PIN) — ver negocio_empleados/auditoria_pin en
 * supabase.sql, la Edge Function supabase/functions/verificar-pin, y el
 * comentario de diseño en components/kiosko/quien-atiende.tsx.
 *
 * "Quién está atendiendo" vive en una COOKIE (fl_empleado), no en
 * localStorage: el middleware de Next.js corre en el edge (antes de
 * renderizar cualquier página) y solo puede leer cookies, no localStorage —
 * es la única forma de bloquear /app/empleados y /app/configuracion por URL
 * directa sin pasar por PIN de dueño (ver middleware.ts). No es httpOnly a
 * propósito: el cliente también la necesita para pintar el modo correcto
 * sin esperar un roundtrip al servidor.
 */

const COOKIE_NAME = "fl_empleado";
const COOKIE_MAX_AGE_DIAS = 180;

const PINS_OBVIOS = new Set(["0000", "1111", "1234", "4321"]);

export function pinEsObvio(pin: string): boolean {
  return PINS_OBVIOS.has(pin) || /^(\d)\1{3}$/.test(pin);
}

function leerCookie(nombre: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getEmpleadoActual(): EmpleadoActual | null {
  const raw = leerCookie(COOKIE_NAME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && typeof parsed.rol === "string") return parsed as EmpleadoActual;
    return null;
  } catch {
    return null;
  }
}

export function setEmpleadoActual(empleado: EmpleadoActual) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(empleado));
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE_DIAS * 86400}; samesite=lax`;
}

/** "Cambiar usuario / Cerrar turno": limpia la cookie y regresa a ¿Quién atiende? — nunca al menú de dueño directo. */
export function clearEmpleadoActual() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}

/** Un empleado (o el dueño, vía su propio PIN) está "activo" en este dispositivo. Modo dueño puro (sin negocio_empleados dado de alta, o dueño en su cel sin haber pasado por el kiosko) = null. */
export function enModoEmpleado(): boolean {
  const actual = getEmpleadoActual();
  return actual != null && actual.rol !== "dueno";
}

/**
 * empleado_id/empleado_nombre_cache para adjuntar a una venta/pedido/cita
 * nueva. Si hay alguien identificado en este dispositivo (empleado o el
 * propio dueño vía kiosko) se llena con eso; si el negocio nunca activó
 * multiusuario (nadie pasó por el kiosko todavía) se queda vacío, igual
 * que antes de esta feature — nunca bloquea ni inventa un empleado.
 */
export function camposEmpleado(): { empleadoId?: string; empleadoNombreCache?: string } {
  const actual = getEmpleadoActual();
  if (!actual) return {};
  return { empleadoId: actual.id, empleadoNombreCache: actual.nombre };
}

interface PermisosRol {
  verHoy: boolean;
  vender: boolean;
  cobrar: boolean;
  verCorteDelDia: boolean;
  verGananciasHistoricas: boolean;
  verGraficasCompletas: boolean;
  ajustarInventario: boolean;
  gestionarEmpleados: boolean;
  editarConfiguracion: boolean;
  borrarVentas: boolean;
  cancelarVentas: boolean;
}

export const PERMISOS: Record<RolEmpleado, PermisosRol> = {
  dueno: {
    verHoy: true,
    vender: true,
    cobrar: true,
    verCorteDelDia: true,
    verGananciasHistoricas: true,
    verGraficasCompletas: true,
    ajustarInventario: true,
    gestionarEmpleados: true,
    editarConfiguracion: true,
    borrarVentas: true,
    cancelarVentas: true,
  },
  encargado: {
    verHoy: true,
    vender: true,
    cobrar: true,
    verCorteDelDia: true,
    verGananciasHistoricas: false,
    verGraficasCompletas: false,
    ajustarInventario: true,
    gestionarEmpleados: false,
    editarConfiguracion: false,
    borrarVentas: false,
    cancelarVentas: true,
  },
  vendedor: {
    verHoy: true,
    vender: true,
    cobrar: true,
    verCorteDelDia: false,
    verGananciasHistoricas: false,
    verGraficasCompletas: false,
    ajustarInventario: false,
    gestionarEmpleados: false,
    editarConfiguracion: false,
    borrarVentas: false,
    cancelarVentas: true,
  },
};

/** Permisos del que está usando el dispositivo AHORA MISMO — sin empleado activo (dueño puro) siempre son los de dueño. */
export function permisosActuales(): PermisosRol {
  const actual = getEmpleadoActual();
  return PERMISOS[actual?.rol ?? "dueno"];
}

/** Genera un PIN de 4 dígitos que no es obvio y no choca con otro empleado activo del negocio (pin_disponible, RPC en supabase.sql) — reintenta unas cuantas veces si choca. */
export async function generarPinDisponible(negocioId: string): Promise<string> {
  for (let intento = 0; intento < 15; intento++) {
    const candidato = String(Math.floor(1000 + Math.random() * 9000));
    if (pinEsObvio(candidato)) continue;
    const { data, error } = await supabase.rpc("pin_disponible", { p_negocio_id: negocioId, p_pin: candidato });
    if (error) throw error;
    if (data) return candidato;
  }
  throw new Error("No se pudo generar un PIN disponible, intenta de nuevo.");
}

export interface VerificarPinResultado {
  ok: boolean;
  empleado?: EmpleadoActual;
  error?: string;
}

/** Llama a la Edge Function verificar-pin (ver supabase/functions/verificar-pin) — el hash y el registro en auditoria_pin viven ahí, nunca en el cliente. */
export async function verificarPin(negocioId: string, empleadoId: string, pin: string): Promise<VerificarPinResultado> {
  const { data, error } = await supabase.functions.invoke("verificar-pin", {
    body: { negocio_id: negocioId, empleado_id: empleadoId, pin },
  });
  if (error || !data || data.error) {
    return { ok: false, error: data?.error ?? "pin_invalido" };
  }
  return { ok: true, empleado: { id: data.empleado_id, nombre: data.nombre, rol: data.rol as RolEmpleado } };
}

/**
 * PIN maestro de dueño (OPCIONAL) — vive en negocio_pin_dueno (ver
 * supabase.sql), no en negocio_empleados: es el switch para volver a modo
 * DUEÑO desde el selector de turno sin depender de tener un empleado con
 * rol='dueno' dado de alta. Todo pasa por RPCs security definer que nunca
 * exponen el hash al cliente.
 */
export async function pinDuenoConfigurado(negocioId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("pin_dueno_configurado", { p_negocio_id: negocioId });
  if (error) {
    console.error("No se pudo checar el PIN de dueño:", error);
    return false;
  }
  return Boolean(data);
}

export async function setPinDueno(negocioId: string, pin: string): Promise<void> {
  const { error } = await supabase.rpc("set_pin_dueno", { p_negocio_id: negocioId, p_pin: pin });
  if (error) throw error;
}

export async function verificarPinDueno(negocioId: string, pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("verificar_pin_dueno", { p_negocio_id: negocioId, p_pin: pin });
  if (error) {
    console.error("No se pudo verificar el PIN de dueño:", error);
    return false;
  }
  return Boolean(data);
}

export async function borrarPinDueno(negocioId: string): Promise<void> {
  const { error } = await supabase.rpc("borrar_pin_dueno", { p_negocio_id: negocioId });
  if (error) throw error;
}

/**
 * "Olvidé mi PIN": manda un magic link al correo de la cuenta (la misma
 * que ya está logueada — los empleados no tienen cuenta propia, solo PIN
 * local, así que este correo es siempre el del dueño real). Al volver por
 * /auth/callback (mismo mecanismo que el login con Google, ver
 * app/auth/callback/route.ts) la sesión queda fresca y app/app/empleados
 * detecta ?reset_pin=1 para borrar el PIN maestro — recién ahí, nunca
 * antes, porque hasta ese momento no se reconfirmó la identidad del dueño.
 */
export async function solicitarResetPinDueno(email: string): Promise<void> {
  const next = encodeURIComponent("/app/empleados?reset_pin=1");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` },
  });
  if (error) throw error;
}
