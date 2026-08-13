import "server-only";
import crypto from "node:crypto";

export const IMPERSONATION_COOKIE = "admin_impersonating";

export interface ImpersonationPayload {
  adminId: string;
  adminEmail: string;
  targetId: string;
  targetEmail: string;
  exp: number; // epoch ms
}

// Reusa la service_role key como secreto de firma: ya es server-only y
// secreta, así no se necesita una variable de entorno nueva solo para esto.
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/**
 * Cookie firmada (HMAC) que recuerda "quién eras antes de impersonar" para
 * poder volver — nunca se confía en su contenido sin validar la firma, o
 * cualquiera podría fabricar una cookie y restaurar la sesión de OTRO admin
 * (ver /api/admin/impersonate/exit, que la valida antes de usarla).
 */
export function createImpersonationCookie(
  data: Omit<ImpersonationPayload, "exp">,
  ttlMs = 2 * 60 * 60 * 1000
): string {
  if (!SECRET) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.");
  const payload: ImpersonationPayload = { ...data, exp: Date.now() + ttlMs };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

export function readImpersonationCookie(value: string | undefined | null): ImpersonationPayload | null {
  if (!value || !SECRET) return null;
  const [json, sig] = value.split(".");
  if (!json || !sig) return null;

  let expectedSig: string;
  try {
    expectedSig = sign(json);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as ImpersonationPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (!payload.adminId || !payload.adminEmail || !payload.targetId || !payload.targetEmail) return null;
    return payload;
  } catch {
    return null;
  }
}
