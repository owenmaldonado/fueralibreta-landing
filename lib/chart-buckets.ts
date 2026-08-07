export type RangoTiempo = "semanal" | "mensual" | "anual";

interface Bucket {
  label: string;
  start: Date;
  end: Date;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const FECHA_SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "YYYY-MM-DD" se interpreta como medianoche LOCAL (no UTC, a diferencia de
 * `new Date(str)`), para que coincida con los buckets de día calculados en local.
 * Fechas con hora ("...T...") sí traen su instante real y se parsean tal cual.
 */
function parseFecha(fecha: string): Date {
  if (FECHA_SOLO_DIA.test(fecha)) {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(fecha);
}

/**
 * Genera los buckets de tiempo relativos a "ahora": el mes/año actual se
 * recalculan solos al pasar la medianoche. "Semanal" es la semana de
 * calendario Lun-Dom en curso (no un rolling de 7 días), y "mensual" son
 * siempre 4 semanas reales del mes (1-7, 8-14, 15-21, 22-fin), nunca 5 —
 * los días 29+ de un mes largo se suman a la semana 4.
 */
function getBuckets(rango: RangoTiempo, now: Date): Bucket[] {
  if (rango === "semanal") {
    const hoy = startOfDay(now);
    // getDay(): 0=Dom..6=Sáb. Días desde el lunes de esta semana.
    const diasDesdeLunes = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(lunes.getDate() - diasDesdeLunes);
    const dias: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes);
      d.setDate(d.getDate() + i);
      dias.push(d);
    }
    return dias.map((d) => {
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      return { label: DIAS[d.getDay()], start: d, end };
    });
  }

  if (rango === "mensual") {
    const year = now.getFullYear();
    const month = now.getMonth();
    const ultimoDiaMes = new Date(year, month + 1, 0).getDate();
    const rangosDias: [number, number][] = [
      [1, 7],
      [8, 14],
      [15, 21],
      [22, ultimoDiaMes],
    ];
    return rangosDias.map(([dIni, dFin], idx) => ({
      label: `Sem ${idx + 1}`,
      start: new Date(year, month, dIni),
      end: new Date(year, month, dFin + 1),
    }));
  }

  // anual: últimos 12 meses terminando en el mes actual
  const meses: Date[] = [];
  for (let i = 11; i >= 0; i--) {
    meses.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return meses.map((d) => {
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label = d.getFullYear() === now.getFullYear() ? MESES[d.getMonth()] : `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    return { label, start: d, end };
  });
}

/**
 * Agrupa `items` en los buckets del rango indicado, sumando `valueOf(item)` en el
 * bucket cuya ventana [start, end) contiene la fecha real de ese item (`dateOf`).
 */
export function aggregateByRange<T>(
  items: T[],
  rango: RangoTiempo,
  dateOf: (item: T) => string,
  valueOf: (item: T) => number,
  now: Date = new Date()
): { label: string; value: number }[] {
  const buckets = getBuckets(rango, now);
  const totals = buckets.map(() => 0);
  for (const item of items) {
    const fecha = parseFecha(dateOf(item));
    if (Number.isNaN(fecha.getTime())) continue;
    for (let i = 0; i < buckets.length; i++) {
      if (fecha >= buckets[i].start && fecha < buckets[i].end) {
        totals[i] += valueOf(item);
        break;
      }
    }
  }
  return buckets.map((b, i) => ({ label: b.label, value: totals[i] }));
}

/**
 * Igual que aggregateByRange pero suma dos series independientes por bucket
 * (por ejemplo ingresos vs gastos) en una sola pasada.
 */
export function aggregateTwoByRange<T>(
  items: T[],
  rango: RangoTiempo,
  dateOf: (item: T) => string,
  splitOf: (item: T) => { a: number; b: number },
  now: Date = new Date()
): { label: string; a: number; b: number }[] {
  const buckets = getBuckets(rango, now);
  const totalsA = buckets.map(() => 0);
  const totalsB = buckets.map(() => 0);
  for (const item of items) {
    const fecha = parseFecha(dateOf(item));
    if (Number.isNaN(fecha.getTime())) continue;
    for (let i = 0; i < buckets.length; i++) {
      if (fecha >= buckets[i].start && fecha < buckets[i].end) {
        const { a, b } = splitOf(item);
        totalsA[i] += a;
        totalsB[i] += b;
        break;
      }
    }
  }
  return buckets.map((b, i) => ({ label: b.label, a: totalsA[i], b: totalsB[i] }));
}
