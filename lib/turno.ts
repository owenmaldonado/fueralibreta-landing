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
 * ¿Este GASTO entra en el turno que estoy cerrando?
 *
 * EL BUG QUE CIERRA (Owen: "en la misma fonda los gastos no se van a 0, se
 * cuenta lo de todo el día en vez de iniciar en cero... lo mismo de los
 * gastos con abarrotera")
 *
 * Las ventas ya arrancaban en cero en cada turno (enTurnoActual, arriba),
 * pero los gastos no: fonda_gastos y abarrotes_gastos solo guardaban `fecha`
 * (un DÍA, no un instante), así que no había forma de saber de qué lado del
 * cierre había caído cada uno y se contaban todos los del día. El turno de
 * la tarde volvía a restar los gastos que el de la mañana ya había
 * entregado, y el corte le salía corto a quien cerraba de noche.
 *
 * La migración 20260925000000 le agrega `created_at` a las dos tablas; con
 * ese instante los gastos se parten por turno igual que las ventas.
 *
 * POR QUÉ NO ES `enTurnoActual` A SECAS
 * Un gasto puede estar PROGRAMADO a futuro ("pagar la renta el día 1"): se
 * captura hoy pero el dinero sale otro día. `fecha` es el día en que sale el
 * dinero y es lo que manda para saber a qué caja pertenece — por eso se
 * exige `fecha === hoy` en vez de mirar el día del instante de captura.
 *
 * COMPATIBILIDAD
 * Un gasto sin `creadoEn` (capturado antes de la migración) se sigue
 * contando en el turno en curso, exactamente como antes. Es a propósito:
 * hacer desaparecer gastos viejos de un corte sería peor que contarlos de
 * más, y se cura solo en cuanto cambia el día.
 */
export function gastoEnTurnoActual(
  gasto: { creadoEn?: string | null; fecha: string },
  business: Pick<Business, "turnoCerradoEn" | "turnoFondaCerradoEn" | "timezone">,
  hoy: string
): boolean {
  // El día en que sale el dinero. Un gasto programado a futuro no toca la
  // caja de hoy; uno con fecha de ayer tampoco.
  if (gasto.fecha !== hoy) return false;

  const desde = inicioDelTurno(business);
  if (!desde) return true; // nunca se ha cerrado nada: el turno es el día entero
  if (!gasto.creadoEn) return true; // gasto viejo sin instante: se cuenta, como siempre

  const capturado = new Date(gasto.creadoEn);
  if (Number.isNaN(capturado.getTime())) return true;
  return capturado > desde;
}

/**
 * Etiqueta para la pantalla de cierre: desde cuándo cuenta este turno. Sirve
 * para que quien cierra entienda por qué el número es el que es (y para que
 * el segundo turno del día no parezca que "perdió" ventas).
 */
export function desdeCuandoCuenta(
  business: Pick<Business, "turnoCerradoEn" | "turnoFondaCerradoEn">,
  timezone: string | undefined,
  /**
   * Día de hoy del negocio ("YYYY-MM-DD"). Obligatorio: sin él esta etiqueta
   * MENTÍA en el caso más común de todos.
   *
   * enTurnoActual() exige dos cosas — que el movimiento sea de HOY y que sea
   * posterior al último cierre — pero esta etiqueta solo miraba la segunda.
   * Un negocio que cerró ayer a las 8pm abría hoy contando desde la
   * medianoche (correcto), mientras la pantalla del corte decía "Desde el
   * último cierre, a las 8:00 p.m." — o sea, anunciaba una ventana que
   * incluiría toda la noche de ayer, que es justo lo que el código NO hace.
   * Quien leía eso y no le cuadraba el número no tenía forma de saber quién
   * de los dos estaba mal.
   */
  hoy: string
): string {
  const desde = inicioDelTurno(business);
  // Sin cierres, o con el último cierre en un día anterior: hoy el turno
  // arranca cuando abrieron, no en la marca vieja.
  if (!desde || diaDelNegocio(desde.toISOString(), timezone) !== hoy) return "Desde que abrieron hoy";
  const hora = desde.toLocaleTimeString("es-MX", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `Desde el último cierre, a las ${hora}`;
}

/** ¿Ya hubo un cierre HOY? Es lo que decide si vale la pena explicar por qué los números arrancaron en cero. */
export function huboCierreHoy(
  business: Pick<Business, "turnoCerradoEn" | "turnoFondaCerradoEn" | "timezone">,
  hoy: string
): boolean {
  const desde = inicioDelTurno(business);
  return desde != null && diaDelNegocio(desde.toISOString(), business.timezone) === hoy;
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
