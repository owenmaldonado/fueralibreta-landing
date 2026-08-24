/**
 * "Hoy" del NEGOCIO, nunca del dispositivo que esté viendo la pantalla —
 * antes cada dashboard mezclaba todayISO(0) (getters LOCALES del Date()
 * del navegador/celular) con un fallback hardcodeado a
 * "America/Bahia_Banderas" cuando negocio.timezone venía vacío. Y venía
 * vacío SIEMPRE: `negocios` nunca tuvo columna `timezone` en Supabase (ver
 * migración que la agrega), así que ese fallback hardcodeado era en
 * realidad la zona usada para TODOS los negocios sin importar dónde
 * estuvieran.
 *
 * Con esto: getDeviceTimezone() se llama UNA sola vez, al dar de alta el
 * negocio (createBusiness() en lib/mock.ts) — se guarda esa zona real y de
 * ahí en adelante hoyEnZona() la usa sin importar en qué dispositivo/zona
 * esté quien esté viendo el dashboard después.
 */

export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Mexico_City";
  } catch {
    return "America/Mexico_City";
  }
}

/** Día calendario de HOY en la zona horaria del negocio — si no se conoce (negocio viejo sin timezone guardado), cae a la del dispositivo que esté evaluando esto en ese momento. */
export function hoyEnZona(timezone?: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone || getDeviceTimezone() });
}

/**
 * "HH:MM" (24h) de la hora actual en la zona horaria del negocio — mismo
 * criterio que hoyEnZona(). Existe porque getDaySlots (lib/agenda.ts)
 * necesita saber si un horario del día "ya pasó": comparar con
 * `new Date()` crudo asume que el runtime corre en la zona del negocio, lo
 * cual es cierto en el navegador de un dueño en México pero NO en un
 * servidor (Vercel corre en UTC) — sin esto, la reserva pública validada
 * del lado del servidor marcaba como "pasado" cualquier horario de la
 * tarde/noche en México, porque para el servidor en UTC ya eran horas
 * "de madrugada" del día siguiente.
 */
export function horaActualEnZona(timezone?: string): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: timezone || getDeviceTimezone(),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
