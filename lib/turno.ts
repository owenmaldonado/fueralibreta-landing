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

  // TIENE QUE SER DE HOY. SIEMPRE. Esta línea es el arreglo.
  //
  // EL BUG QUE CIERRA (Owen: "en fonda, en las ventas de la página principal
  // en vez de aparecer con 0 apareció con la cuenta de ayer, no se reseteó")
  // Antes, si había un cierre previo, la única condición era `creadoEn >
  // desde`. Nadie miraba el día. Así que un negocio que cerró ayer a las
  // 8pm y vendió a las 8:30pm arrancaba HOY contando esa venta de ayer: la
  // marca del cierre es de ayer, y la venta es posterior a ella, así que
  // pasaba el filtro. Y se quedaba pegada día tras día hasta el siguiente
  // cierre.
  //
  // Las dos condiciones tienen que cumplirse a la vez: del día de hoy Y
  // después del último cierre. Con una sola no alcanza — por "solo después
  // del cierre" entraba lo de ayer, y por "solo de hoy" el segundo turno del
  // día volvía a contar lo del primero, que era el bug anterior.
  if (diaDelNegocio(mov.creadoEn, business.timezone) !== hoy) return false;

  return desde ? new Date(mov.creadoEn) > desde : true;
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
  mov: { fecha: string; hora?: string; cobradoEn?: string | null },
  business: Pick<Business, "turnoCerradoEn" | "turnoFondaCerradoEn" | "timezone">,
  hoy: string
): boolean {
  // EL BUG DE LOS $300 (Owen: "le di la 2da vez a cerrar turno y sale que se
  // hicieron 300 en cortes, debería estar en 0 porque no hice ningún
  // movimiento")
  //
  // `hora` es la hora a la que está AGENDADA la cita, no a la que se cobró.
  // Son cosas distintas y aquí se estaban usando como si fueran la misma.
  // Con un cierre a las 6:45pm, una cita agendada a las 8pm que ya se había
  // cobrado a las 5pm daba `"20:00" > "18:45"` = true y volvía a contar en
  // el turno nuevo, sin que nadie hubiera hecho nada. Al revés también
  // fallaba: un cliente que llega tarde y se cobra a las 7pm con cita de las
  // 10am quedaba FUERA del turno en el que de verdad entró el dinero.
  //
  // `cobradoEn` es el instante real en que se marcó "listo" (se cobró). Es
  // el dato correcto y se usa siempre que exista.
  if (mov.cobradoEn) {
    return enTurnoActual({ creadoEn: mov.cobradoEn }, business, hoy);
  }

  // Citas de antes de que se guardara ese instante: se sigue con el criterio
  // viejo de día + hora. No es exacto, pero es lo único que hay para el
  // histórico, y así ninguna cita vieja desaparece de golpe de un corte.
  const desde = inicioDelTurno(business);
  if (!desde) return mov.fecha === hoy;
  // Mismo arreglo que en enTurnoActual: además de ser posterior al cierre,
  // tiene que ser de HOY, o lo de ayer se queda pegado.
  if (mov.fecha !== hoy) return false;

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
