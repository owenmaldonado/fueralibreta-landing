import { z } from "zod";

// ============================================================================
// Esquemas de validación compartidos entre frontend y backend (Route
// Handlers). Mismas reglas en los dos lados: el frontend valida para dar
// feedback inmediato, el backend vuelve a validar porque el frontend nunca
// es de fiar (cualquiera puede pegarle directo a la API).
// ============================================================================

/** Solo dígitos (sin espacios, guiones ni +52): 7 a 15 caracteres, como pide un teléfono real. */
export const telefonoSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{7,15}$/, "El teléfono debe tener solo números (7 a 15 dígitos).");

/** WhatsApp de contacto en /onboarding: exactamente 10 dígitos, sin lada de país (+52) ni espacios/guiones — un celular mexicano real. */
export const telefonoMxSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{10}$/, "El WhatsApp debe tener exactamente 10 dígitos (sin +52).");

/** Nombre de persona: hasta 50 caracteres, sin `<`/`>` para bloquear intentos de inyectar HTML/scripts. */
export const nombreSchema = z
  .string()
  .trim()
  .min(2, "El nombre es muy corto.")
  .max(50, "El nombre no puede tener más de 50 caracteres.")
  .regex(/^[^<>]+$/, "El nombre no puede contener los caracteres < o >.");

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Slug inválido.");

export const uuidSchema = z.string().uuid();

export const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
export const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida.");

/** Body de POST /api/public/citas (reservar cita pública en /b/[slug]). */
export const citaPublicaSchema = z.object({
  slug: slugSchema,
  servicioId: uuidSchema,
  nombre: nombreSchema,
  telefono: telefonoSchema,
  fecha: fechaSchema,
  hora: horaSchema,
});

/** Body de POST /api/public/citas/lookup (ver mi cita por teléfono). */
export const citaLookupSchema = z.object({
  slug: slugSchema,
  telefono: telefonoSchema,
});

/** Valores válidos de `leads.tipo_negocio` (ver supabase/migrations/20260815000000_esquema.sql). */
export const LEAD_TIPOS = ["fonda", "abarrotes", "barberia", "otro"] as const;
export type LeadTipoNegocio = (typeof LEAD_TIPOS)[number];

/** El selector del formulario manda una etiqueta en español ("Barbería"...); esto la normaliza al enum de `leads`. */
export function normalizeTipoNegocio(negocio: string): LeadTipoNegocio {
  const needle = negocio.trim().toLowerCase();
  if (needle.startsWith("barber")) return "barberia";
  if (needle.startsWith("fond")) return "fonda";
  if (needle.startsWith("abarrote")) return "abarrotes";
  return "otro";
}

/** Body de POST /api/public/contacto (formulario de la landing). */
export const contactoSchema = z.object({
  nombre: nombreSchema,
  telefono: telefonoSchema,
  negocio: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[^<>]+$/, "Valor inválido."),
  mensaje: z
    .string()
    .trim()
    .max(1000, "El mensaje no puede tener más de 1000 caracteres.")
    .regex(/^[^<>]*$/, "El mensaje no puede contener los caracteres < o >.")
    .optional()
    .or(z.literal("")),
});

/** Body de POST /api/public/consent (banner de cookies, ver components/ConsentBanner.tsx). */
export const consentSchema = z.object({
  acepto_terminos: z.boolean(),
  acepto_privacidad: z.boolean(),
  acepto_cookies: z.boolean(),
});
