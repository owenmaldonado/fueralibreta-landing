/**
 * Buckets de las gráficas — REESCRITO para trabajar SOLO con strings
 * "YYYY-MM-DD", nunca con objetos Date.
 *
 * POR QUÉ (el bug de Fondita que volvía una y otra vez: "la gráfica se
 * lleva todo al día anterior"):
 *
 * La versión anterior construía los límites de cada bucket con
 * `new Date(año, mes, día)` y convertía la fecha de cada movimiento con
 * `new Date(...)`. Los dos son constructores LOCALES: dependen de la zona
 * horaria del dispositivo que está pintando la pantalla. En cambio la
 * fecha que trae un pedido/gasto/venta es el día calendario del NEGOCIO
 * (lo escribe quien lo captura, ver lib/fecha.ts). Mientras las dos zonas
 * coincidan no se nota nada; en cuanto se separan aunque sea una hora —
 * celular en otra zona, hora del sistema mal puesta, un negocio con
 * `timezone` guardado distinto al del dispositivo, o simplemente un
 * `new Date("2026-08-28")` que JS interpreta como MEDIANOCHE UTC y en
 * México es el 27 a las 6pm — el movimiento cae un bucket antes. Ese
 * corrimiento de una hora es exactamente "todo se fue al día anterior".
 *
 * Con strings eso no puede pasar: "2026-08-28" >= "2026-08-24" es una
 * comparación de texto. No hay zona horaria, no hay medianoche, no hay
 * horario de verano, no hay nada que corrimiento que aplicar. La ÚNICA
 * conversión de zona horaria que queda pasa por `diaDelNegocio()`, y solo
 * para los movimientos que de verdad guardan un instante (timestamptz,
 * como abarrotes_ventas.fecha) en vez de un día calendario.
 *
 * La aritmética de calendario interna (sumar días, saber qué día de la
 * semana cae) usa Date.UTC — que no es "una zona horaria más", es
 * simplemente el modo del constructor que NO consulta la zona del
 * dispositivo. Entra un string, sale un string.
 */

export type RangoTiempo = "semanal" | "mensual" | "anual";

/** Ventana de un bucket, inclusiva en los dos extremos — todo en "YYYY-MM-DD". */
interface Bucket {
  label: string;
  desde: string;
  hasta: string;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const FECHA_SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Partes de un "YYYY-MM-DD" — sin pasar por Date, así que no hay nada que se pueda correr. */
function partes(fecha: string): { y: number; m: number; d: number } {
  const [y, m, d] = fecha.split("-").map(Number);
  return { y, m, d };
}

function armar(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Suma (o resta) días a un "YYYY-MM-DD" y devuelve otro "YYYY-MM-DD".
 * Date.UTC + getUTC* a propósito: es aritmética de calendario pura, el
 * reloj y la zona del dispositivo no participan.
 */
function sumarDias(fecha: string, dias: number): string {
  const { y, m, d } = partes(fecha);
  const x = new Date(Date.UTC(y, m - 1, d) + dias * MS_DIA);
  return armar(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

/** 0=Domingo .. 6=Sábado, del día calendario que dice el string (no del dispositivo). */
function diaDeLaSemana(fecha: string): number {
  const { y, m, d } = partes(fecha);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function ultimoDiaDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Normaliza CUALQUIER fecha de un movimiento al día calendario del negocio.
 *
 * - "2026-08-28" (columnas `date`: fonda_pedidos.fecha, *_gastos.fecha,
 *   barberia_citas.fecha) ya ES el día del negocio — se devuelve tal cual,
 *   sin tocarlo. Este es el 90% de los casos y el que más se rompía antes.
 * - "2026-08-28T01:30:00+00:00" (columnas `timestamptz`, como
 *   abarrotes_ventas.fecha) sí es un instante: se convierte al día que era
 *   EN EL NEGOCIO en ese instante. Sin `timezone` cae al día del
 *   dispositivo, que es lo mejor que se puede hacer sin saber la zona.
 */
export function diaDelNegocio(fecha: string, timezone?: string): string {
  if (FECHA_SOLO_DIA.test(fecha)) return fecha;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", timezone ? { timeZone: timezone } : undefined);
}

export /**
 * Día calendario de una columna que GUARDA UN DÍA, no un instante
 * (fonda_pedidos.fecha, *_gastos.fecha, barberia_citas.fecha, etc.).
 *
 * EL BUG QUE ARREGLA — el de "la gráfica de Fondita se lleva todo al día
 * anterior", que aguantó cinco días de intentos:
 *
 * Esas columnas están declaradas `date` en el esquema, y una columna `date`
 * llega del servidor como "2026-08-28". Pero en bases que vienen de una
 * versión vieja de la tabla, `create table if not exists` y
 * `add column if not exists` NO cambian el tipo de una columna que ya
 * existía — así que ahí `fecha` se quedó como `timestamptz` y llega como
 * "2026-08-28T00:00:00+00:00": medianoche UTC.
 *
 * Medianoche UTC del 28 es, en México, el 27 a las 6 de la tarde. Así que
 * cualquier cosa que interprete ese texto como un instante (`new Date(...)`,
 * que es lo que hacía la gráfica) contesta 27. En memoria, antes de
 * refrescar, la fecha era el string "2026-08-28" que puso quien capturó el
 * pedido y todo se veía bien; al refrescar volvía de la base como
 * timestamptz y se corría un día. De ahí el "al refrescar todo se va al día
 * anterior".
 *
 * Cortar a 10 caracteres es correcto en los dos casos y no depende de
 * ninguna zona horaria: "2026-08-28" se queda igual, y
 * "2026-08-28T00:00:00+00:00" entrega el día que se quiso guardar. Se
 * aplica aquí, en la frontera con la base, para que ninguna pantalla de
 * arriba tenga que volver a enterarse de esto.
 *
 * OJO: NO se usa en barberia_caja.fecha ni abarrotes_ventas.fecha — esas dos
 * sí son timestamptz a propósito (guardan el momento exacto del movimiento)
 * y se convierten con fechaCalendarioLocal(), que sí mira la zona del
 * negocio.
 */
function diaDeColumnaFecha(valor: unknown): string {
  return typeof valor === "string" ? valor.slice(0, 10) : "";
}

/**
 * Contexto de la gráfica: qué día es "hoy" PARA EL NEGOCIO y en qué zona
 * interpretar los movimientos que guardan un instante.
 *
 * `hoy` es obligatorio a propósito. Antes este valor salía de un
 * `new Date()` por default y cada pantalla podía olvidarse de pasarlo (la
 * de Caja se olvidaba), lo que dejaba la gráfica anclada al reloj del
 * dispositivo mientras los datos venían en día del negocio. Ahora no
 * compila sin él.
 */
export interface ContextoRango {
  /** "YYYY-MM-DD" del día de HOY en la zona del negocio — ver useHoy() en lib/use-hoy.ts. */
  hoy: string;
  /** IANA del negocio, solo para movimientos con timestamptz. */
  timezone?: string;
}

/**
 * Buckets del rango, anclados al día del negocio.
 *
 * - semanal: la semana de calendario Lun-Dom en curso (no un rolling de 7).
 * - mensual: 4 semanas reales del mes (1-7, 8-14, 15-21, 22-fin), nunca 5 —
 *   los días 29+ de un mes largo se suman a la semana 4.
 * - anual: los últimos 12 meses terminando en el mes de `hoy`.
 */
function getBuckets(rango: RangoTiempo, hoy: string): Bucket[] {
  if (rango === "semanal") {
    // diaDeLaSemana: 0=Dom..6=Sáb → días transcurridos desde el lunes.
    const lunes = sumarDias(hoy, -((diaDeLaSemana(hoy) + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const dia = sumarDias(lunes, i);
      return { label: DIAS[diaDeLaSemana(dia)], desde: dia, hasta: dia };
    });
  }

  if (rango === "mensual") {
    const { y, m } = partes(hoy);
    const fin = ultimoDiaDelMes(y, m);
    const cortes: [number, number][] = [
      [1, 7],
      [8, 14],
      [15, 21],
      [22, fin],
    ];
    return cortes.map(([dIni, dFin], i) => ({
      label: `Sem ${i + 1}`,
      desde: armar(y, m, dIni),
      hasta: armar(y, m, dFin),
    }));
  }

  // anual: 12 meses terminando en el de `hoy`.
  const { y, m } = partes(hoy);
  return Array.from({ length: 12 }, (_, i) => {
    const offset = m - 1 - (11 - i); // meses desde enero, puede ser negativo
    const anio = y + Math.floor(offset / 12);
    const mes = ((offset % 12) + 12) % 12; // 0-based
    const label = anio === y ? MESES[mes] : `${MESES[mes]} ${String(anio).slice(2)}`;
    return {
      label,
      desde: armar(anio, mes + 1, 1),
      hasta: armar(anio, mes + 1, ultimoDiaDelMes(anio, mes + 1)),
    };
  });
}

/** Índice del bucket que contiene esa fecha, o -1. Comparación de strings pura. */
function indiceDeBucket(buckets: Bucket[], dia: string): number {
  if (!dia) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (dia >= buckets[i].desde && dia <= buckets[i].hasta) return i;
  }
  return -1;
}

/** Suma `valueOf(item)` en el bucket al que cae la fecha de cada item. */
export function aggregateByRange<T>(
  items: T[],
  rango: RangoTiempo,
  dateOf: (item: T) => string,
  valueOf: (item: T) => number,
  ctx: ContextoRango
): { label: string; value: number }[] {
  const buckets = getBuckets(rango, ctx.hoy);
  const totales = buckets.map(() => 0);
  for (const item of items) {
    const i = indiceDeBucket(buckets, diaDelNegocio(dateOf(item), ctx.timezone));
    if (i >= 0) totales[i] += valueOf(item);
  }
  return buckets.map((b, i) => ({ label: b.label, value: totales[i] }));
}

/** Igual que aggregateByRange pero con dos series independientes (ej. ingresos vs gastos) en una pasada. */
export function aggregateTwoByRange<T>(
  items: T[],
  rango: RangoTiempo,
  dateOf: (item: T) => string,
  splitOf: (item: T) => { a: number; b: number },
  ctx: ContextoRango
): { label: string; a: number; b: number }[] {
  const buckets = getBuckets(rango, ctx.hoy);
  const totalesA = buckets.map(() => 0);
  const totalesB = buckets.map(() => 0);
  for (const item of items) {
    const i = indiceDeBucket(buckets, diaDelNegocio(dateOf(item), ctx.timezone));
    if (i < 0) continue;
    const { a, b } = splitOf(item);
    totalesA[i] += a;
    totalesB[i] += b;
  }
  return buckets.map((b, i) => ({ label: b.label, a: totalesA[i], b: totalesB[i] }));
}

/**
 * Filtra a los items dentro de la ventana COMPLETA del rango (primer bucket
 * .. último bucket) — para que la lista de abajo respete el mismo
 * semanal/mensual/anual que la gráfica de arriba, con exactamente el mismo
 * criterio de fechas.
 */
export function filterByRango<T>(items: T[], rango: RangoTiempo, dateOf: (item: T) => string, ctx: ContextoRango): T[] {
  const buckets = getBuckets(rango, ctx.hoy);
  const desde = buckets[0].desde;
  const hasta = buckets[buckets.length - 1].hasta;
  return items.filter((item) => {
    const dia = diaDelNegocio(dateOf(item), ctx.timezone);
    return dia !== "" && dia >= desde && dia <= hasta;
  });
}

/** Lunes y domingo (inclusive) de la semana de `hoy` — mismo cálculo que el rango "semanal", expuesto para las pantallas que lo necesitan aparte. */
export function semanaDe(hoy: string): { desde: string; hasta: string } {
  const lunes = sumarDias(hoy, -((diaDeLaSemana(hoy) + 6) % 7));
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

/** "YYYY-MM-DD" del día siguiente/anterior — aritmética de calendario sin zonas horarias. */
export function diaRelativo(fecha: string, dias: number): string {
  return sumarDias(fecha, dias);
}
