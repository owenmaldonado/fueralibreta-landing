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
