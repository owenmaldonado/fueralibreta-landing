import { diaDelNegocio } from "./chart-buckets";
import type { Business } from "./types";

/**
 * "¿Esto entra en el turno que estoy cerrando?" — una sola respuesta para las
 * tres apps.
 *
 * EL BUG QUE CIERRA
 * Barbería y Abarrotera filtraban su corte por `fecha === hoy`: todo el día,
 * siempre, sin mirar si ya hubo un cierre antes. Así que el segundo turno del
 * día volvía a contar lo del primero, y el vendedor de la tarde terminaba
 * cuadrando dinero que el de la mañana ya había entregado. Solo Fondita
 * llevaba la marca del último cierre.
 *
 * EL CRITERIO
 * - Si ya hubo un cierre, el turno es TODO lo posterior a ese momento. Se
 *   comparan instantes (created_at contra la marca del cierre), que es lo
 *   correcto: un turno arranca en un momento exacto, no a medianoche.
 * - Si nunca se ha cerrado nada, el turno es el DÍA del negocio. Aquí se
 *   compara el día calendario, no un instante: "la medianoche" calculada con
 *   `new Date(...)` es la del dispositivo, y en un celular en otra zona eso
 *   metía ventas de ayer o dejaba fuera las de la madrugada.
 *
 * Es del NEGOCIO, no de cada persona, y a propósito: el corte se compara
 * contra el dinero que hay en el cajón, y el cajón es uno solo. Si dos
 * personas comparten caja no hay forma de partir el efectivo físico entre
 * las dos. Quién cerró sí queda registrado — eso es lo que /app/cortes usa.
 */
export function inicioDelTurno(business: Pick<Business, "turnoCerradoEn" | "turnoFondaCerradoEn">): Date | null {
  const marca = business.turnoCerradoEn ?? business.turnoFondaCerradoEn ?? null;
  if (!marca) return null;
  const d = new Date(marca);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Decide si un movimiento entra en el turno en curso.
 *
 * `creadoEn` es el instante real (created_at). `fecha` es el día calendario
 * del negocio, que es a lo que se cae cuando no hay instante — movimientos
 * viejos de antes de que se guardara created_at, o los que solo tienen día.
 */
export function enTurnoActual(
  mov: { creadoEn?: string | null; fecha?: string | null },
  business: Pick<Business, "turnoCerradoEn" | "turnoFondaCerradoEn" | "timezone">,
  hoy: string
): boolean {
  const desde = inicioDelTurno(business);

  if (!mov.creadoEn) {
    // Sin instante no se puede saber de qué lado del cierre cayó. Se cuenta
    // si es de hoy: es lo mismo que hacía la app antes de este arreglo, así
    // que ningún movimiento viejo desaparece de golpe de un corte.
    return mov.fecha ? mov.fecha === hoy : false;
  }
  if (desde) return new Date(mov.creadoEn) > desde;
  return diaDelNegocio(mov.creadoEn, business.timezone) === hoy;
}

/**
 * Etiqueta para la pantalla de cierre: desde cuándo cuenta este turno. Sirve
 * para que quien cierra entienda por qué el número es el que es (y para que
 * el segundo turno del día no parezca que "perdió" ventas).
 */
export function desdeCuandoCuenta(
  business: Pick<Business, "turnoCerradoEn" | "turnoFondaCerradoEn">,
  timezone?: string
): string {
  const desde = inicioDelTurno(business);
  if (!desde) return "Desde que abrieron hoy";
  const hora = desde.toLocaleTimeString("es-MX", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `Desde el último cierre, a las ${hora}`;
}

/**
 * Igual que enTurnoActual, pero para registros que NO guardan un instante:
 * solo el día y la hora por separado. Es el caso de barberia_citas
 * (`fecha` = "2026-08-28", `hora` = "14:30").
 *
 * No se intenta reconstruir el instante a partir de día + hora + zona
 * horaria: esa conversión es un campo minado (horario de verano, offsets de
 * :30) y no hace falta. Basta con bajar el momento del cierre a "día y hora
 * DEL NEGOCIO" y comparar los dos como texto — "2026-08-28 14:30" contra
 * "2026-08-28 09:00" se ordena solo, sin que ninguna zona participe.
 */
export function enTurnoActualPorDiaYHora(
  mov: { fecha: string; hora?: string },
  business: Pick<Business, "turnoCerradoEn" | "turnoFondaCerradoEn" | "timezone">,
  hoy: string
): boolean {
  const desde = inicioDelTurno(business);
  if (!desde) return mov.fecha === hoy;

  const diaCierre = diaDelNegocio(desde.toISOString(), business.timezone);
  const horaCierre = desde.toLocaleTimeString("en-GB", {
    timeZone: business.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Una cita sin hora (no debería pasar) se trata como del inicio del día:
  // así queda del lado del turno anterior en vez de colarse al nuevo.
  return `${mov.fecha} ${mov.hora ?? "00:00"}` > `${diaCierre} ${horaCierre}`;
}
