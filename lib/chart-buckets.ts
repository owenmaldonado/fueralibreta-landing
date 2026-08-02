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
 * Genera los buckets de tiempo relativos a "ahora": el rango siempre termina en
 * hoy, así que al pasar la medianoche "Hoy"/"Ayer" y el mes actual se recalculan solos.
 */
function getBuckets(rango: RangoTiempo, now: Date): Bucket[] {
  if (rango === "semanal") {
    const hoy = startOfDay(now);
    const dias: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(d.getDate() - i);
      dias.push(d);
    }
    return dias.map((d, idx) => {
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      const label = idx === dias.length - 1 ? "Hoy" : idx === dias.length - 2 ? "Ayer" : DIAS[d.getDay()];
      return { label, start: d, end };
    });
  }

  if (rango === "mensual") {
    const hoy = startOfDay(now);
    const primero = new Date(now.getFullYear(), now.getMonth(), 1);
    const dias: Date[] = [];
    for (let d = new Date(primero); d <= hoy; d.setDate(d.getDate() + 1)) {
      dias.push(new Date(d));
    }
    return dias.map((d) => {
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      return { label: String(d.getDate()), start: d, end };
    });
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
