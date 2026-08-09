import "server-only";

// ============================================================================
// Rate limit por IP, en memoria, para los endpoints públicos de creación
// (citas, pedidos, contacto) — evita que un bot mande spam sin depender de
// infraestructura extra (Redis, etc). Ventana fija de 60s.
//
// Limitación conocida: esto vive en la memoria de cada instancia del
// servidor. En un deploy serverless con varias instancias (p. ej. Vercel con
// tráfico alto) cada una lleva su propio conteo, así que el límite real
// efectivo puede ser N × (número de instancias) en vez de N. Para el volumen
// de un negocio local esto ya evita el abuso obvio; si el tráfico crece,
// cambiar este Map por Upstash Redis (o similar) da un límite exacto entre
// instancias.
// ============================================================================

const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

// Evita que el Map crezca sin límite si entran muchas IPs distintas.
function cleanup(now: number) {
  if (hits.size < 5000) return;
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

/** true si `key` (normalmente `"ruta:ip"`) sigue dentro del límite de `limit` requests por minuto. */
export function checkRateLimit(key: string, limit = 10): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: limit - 1, resetAt: now + WINDOW_MS };
  }

  if (entry.count >= limit) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { ok: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/** IP del cliente detrás del proxy/CDN (Vercel, etc.), con fallback razonable. */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
