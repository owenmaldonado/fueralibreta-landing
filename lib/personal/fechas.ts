// ============================================================================
// Fechas de la app personal. Todo el módulo habla un solo idioma: "YYYY-MM-DD".
//
// Regla dura: NUNCA se construye un Date a partir de un ISO corto con
// `new Date("2026-08-29")` — eso lo interpreta como MEDIANOCHE UTC, así que
// en México (UTC-6/-7) se convierte en el día ANTERIOR a las 6pm. Ese bug ya
// mordió a FueraLibreta (ver la migración 20260915000000_fecha_es_dia_no_instante).
// Aquí se corta de raíz: se parsea a mano a un Date local con `new Date(a, m-1, d)`.
// ============================================================================

export type ISODate = string; // "YYYY-MM-DD"

const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["D", "L", "M", "M", "J", "V", "S"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export { DIAS_LARGOS, DIAS_CORTOS, MESES_LARGOS, MESES_CORTOS };

/** Hoy en la zona horaria del dispositivo, como "YYYY-MM-DD". */
export function hoy(): ISODate {
  return aISO(new Date());
}

/** Date (local) -> "YYYY-MM-DD". "en-CA" da exactamente ese formato. */
export function aISO(d: Date): ISODate {
  return d.toLocaleDateString("en-CA");
}

/** "YYYY-MM-DD" -> Date local a las 00:00 (nunca UTC, ver nota de arriba). */
export function aDate(iso: ISODate): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

/** Suma (o resta, con negativo) días a una fecha ISO, respetando cambios de mes/año. */
export function sumarDias(iso: ISODate, dias: number): ISODate {
  const d = aDate(iso);
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

export function sumarMeses(iso: ISODate, meses: number): ISODate {
  const d = aDate(iso);
  const diaOriginal = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  // 31 de enero + 1 mes debe caer en el último día de febrero, no en el 3 de marzo.
  d.setDate(Math.min(diaOriginal, diasEnMes(d.getFullYear(), d.getMonth())));
  return aISO(d);
}

export function diasEnMes(anio: number, mes0: number): number {
  return new Date(anio, mes0 + 1, 0).getDate();
}

/** 0=domingo … 6=sábado. */
export function diaSemana(iso: ISODate): number {
  return aDate(iso).getDay();
}

/** El lunes de la semana a la que pertenece `iso` (la semana empieza en lunes). */
export function inicioSemana(iso: ISODate): ISODate {
  const dow = diaSemana(iso);
  return sumarDias(iso, dow === 0 ? -6 : 1 - dow);
}

/** Los 7 días de la semana de `iso`, de lunes a domingo. */
export function semanaDe(iso: ISODate): ISODate[] {
  const lunes = inicioSemana(iso);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/** Todos los días de un mes (mes0: 0-11). */
export function diasDelMes(anio: number, mes0: number): ISODate[] {
  const total = diasEnMes(anio, mes0);
  const mm = String(mes0 + 1).padStart(2, "0");
  return Array.from({ length: total }, (_, i) => `${anio}-${mm}-${String(i + 1).padStart(2, "0")}`);
}

/** Rango inclusivo [desde, hasta]. */
export function rango(desde: ISODate, hasta: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = desde;
  // Guarda contra un rango invertido o absurdo: 5 años es más de lo que
  // cualquier pantalla de esta app pide de un jalón.
  for (let i = 0; cur <= hasta && i < 1900; i++) {
    out.push(cur);
    cur = sumarDias(cur, 1);
  }
  return out;
}

export function diasEntre(a: ISODate, b: ISODate): number {
  return Math.round((aDate(b).getTime() - aDate(a).getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Formatos para pantalla
// ---------------------------------------------------------------------------

/** "jueves 29 de agosto" */
export function formatoLargo(iso: ISODate): string {
  const d = aDate(iso);
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}`;
}

/** "29 ago" */
export function formatoCorto(iso: ISODate): string {
  const d = aDate(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

/** "Agosto 2026" */
export function formatoMes(anio: number, mes0: number): string {
  const nombre = MESES_LARGOS[mes0];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${anio}`;
}

/** "Hoy" / "Ayer" / "Mañana" cuando aplica; si no, el formato largo. */
export function etiquetaRelativa(iso: ISODate, referencia: ISODate = hoy()): string {
  const delta = diasEntre(referencia, iso);
  if (delta === 0) return "Hoy";
  if (delta === -1) return "Ayer";
  if (delta === 1) return "Mañana";
  return formatoLargo(iso);
}

/** "14:30" a partir de un "14:30:00" de Postgres (o null). */
export function soloHora(hora: string | null | undefined): string {
  if (!hora) return "";
  return hora.slice(0, 5);
}
