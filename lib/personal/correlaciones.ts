// ============================================================================
// Cruces entre lo que HACES y cómo te SIENTES.
//
// Es la única parte de la app que dice algo que tú no escribiste. Por eso es
// también la que más cuidado necesita: una "correlación" sacada de tres días
// es ruido con cara de dato. Cada comparación exige un mínimo de días de los
// DOS lados (MINIMO_POR_LADO) y, si no lo alcanza, no se inventa nada: se dice
// cuántos días faltan.
//
// Nada de esto prueba causalidad y el texto de la app nunca la afirma: dice
// "los días que X, tu ánimo promedio es Y", que es exactamente lo que se
// midió.
// ============================================================================

import type { Dia, ISODate } from "./tipos";

/** Días mínimos en cada grupo para que la comparación valga la pena mostrarse. */
export const MINIMO_POR_LADO = 4;

export interface Comparacion {
  clave: string;
  titulo: string;
  /** Descripción del grupo A ("los días que entrenas"). */
  etiquetaCon: string;
  etiquetaSin: string;
  promedioCon: number;
  promedioSin: number;
  diasCon: number;
  diasSin: number;
  /** Diferencia con − sin, redondeada a un decimal. */
  delta: number;
  /** false cuando falta data; la pantalla muestra cuántos días faltan en vez de un número engañoso. */
  suficiente: boolean;
}

function promedio(valores: number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function comparar(
  clave: string,
  titulo: string,
  etiquetaCon: string,
  etiquetaSin: string,
  con: number[],
  sin: number[]
): Comparacion {
  const pCon = promedio(con);
  const pSin = promedio(sin);
  return {
    clave,
    titulo,
    etiquetaCon,
    etiquetaSin,
    promedioCon: Math.round(pCon * 10) / 10,
    promedioSin: Math.round(pSin * 10) / 10,
    diasCon: con.length,
    diasSin: sin.length,
    delta: Math.round((pCon - pSin) * 10) / 10,
    suficiente: con.length >= MINIMO_POR_LADO && sin.length >= MINIMO_POR_LADO,
  };
}

export interface EntradaAnimo {
  fecha: ISODate;
  animo: number;
  /** 0-100 de hábitos cumplidos ese día. */
  porcentajeHabitos: number;
  entreno: boolean;
  horasSueno: number | null;
}

/** Arma la serie base: solo días con ánimo registrado (sin ánimo no hay nada que correlacionar). */
export function armarSerie(
  dias: Dia[],
  porcentajePorFecha: Map<ISODate, number>,
  fechasConGym: Set<ISODate>
): EntradaAnimo[] {
  return dias
    .filter((d) => d.animo != null)
    .map((d) => ({
      fecha: d.fecha,
      animo: d.animo as number,
      porcentajeHabitos: porcentajePorFecha.get(d.fecha) ?? 0,
      entreno: fechasConGym.has(d.fecha),
      horasSueno: d.horasSueno,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function comparaciones(serie: EntradaAnimo[]): Comparacion[] {
  const conGym = serie.filter((e) => e.entreno).map((e) => e.animo);
  const sinGym = serie.filter((e) => !e.entreno).map((e) => e.animo);

  const conSueno = serie.filter((e) => (e.horasSueno ?? 0) >= 7).map((e) => e.animo);
  const sinSueno = serie.filter((e) => e.horasSueno != null && e.horasSueno < 7).map((e) => e.animo);

  const buenDia = serie.filter((e) => e.porcentajeHabitos >= 80).map((e) => e.animo);
  const malDia = serie.filter((e) => e.porcentajeHabitos < 50).map((e) => e.animo);

  return [
    comparar("gym", "Entrenar", "los días que entrenas", "los días que no", conGym, sinGym),
    comparar("sueno", "Dormir 7 h o más", "durmiendo 7 h o más", "durmiendo menos de 7 h", conSueno, sinSueno),
    comparar(
      "habitos",
      "Cumplir tus hábitos",
      "los días que cumples 80% o más",
      "los días bajo 50%",
      buenDia,
      malDia
    ),
  ];
}

/** Ánimo promedio por día de la semana (0=domingo). null donde no hay datos. */
export function animoPorDiaSemana(serie: EntradaAnimo[]): (number | null)[] {
  const cubetas: number[][] = [[], [], [], [], [], [], []];
  for (const e of serie) {
    const [a, m, d] = e.fecha.split("-").map(Number);
    cubetas[new Date(a, m - 1, d).getDay()].push(e.animo);
  }
  return cubetas.map((v) => (v.length === 0 ? null : Math.round(promedio(v) * 10) / 10));
}

/** Cuántas veces apareció cada nivel de ánimo (1-5). */
export function distribucionAnimo(serie: EntradaAnimo[]): number[] {
  const conteo = [0, 0, 0, 0, 0];
  for (const e of serie) {
    if (e.animo >= 1 && e.animo <= 5) conteo[e.animo - 1]++;
  }
  return conteo;
}
