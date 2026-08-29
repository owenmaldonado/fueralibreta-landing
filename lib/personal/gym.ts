// ============================================================================
// Lo que se puede saber del gym a partir del historial: récords, "la vez
// pasada" y progresión por ejercicio.
//
// Todo se deriva de las sesiones ya cargadas — no hay tablas de récords ni de
// máximos. Un récord guardado en la base es un dato que se desincroniza en
// cuanto borras o corriges una serie; calculado, siempre dice la verdad.
// ============================================================================

import { unoRMEstimado, volumenSeries } from "./reglas";
import type { ISODate, Serie, Sesion } from "./tipos";

/** Los ejercicios se identifican por nombre; "Press Banca" y "press banca" son el mismo. */
export function normalizarEjercicio(nombre: string): string {
  return nombre.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export interface MarcaEjercicio {
  nombre: string;
  /** Mejor serie por 1RM estimado. */
  mejorSerie: { pesoKg: number; repeticiones: number; unoRM: number; fecha: ISODate } | null;
  /** Peso máximo levantado, sin importar reps. */
  pesoMaximo: number;
  vecesEntrenado: number;
  ultimaVez: { fecha: ISODate; series: Serie[] } | null;
}

/**
 * Marca de cada ejercicio a partir de un historial de sesiones.
 * `hasta` (exclusivo) permite preguntar "¿cuál era mi récord ANTES de esta
 * sesión?", que es lo que hace falta para saber si la sesión de hoy lo rompió.
 */
export function marcasPorEjercicio(sesiones: Sesion[], hasta?: ISODate): Map<string, MarcaEjercicio> {
  const marcas = new Map<string, MarcaEjercicio>();
  // De la más vieja a la más nueva para que `ultimaVez` acabe siendo la última.
  const ordenadas = [...sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));

  for (const sesion of ordenadas) {
    if (hasta && sesion.fecha >= hasta) continue;
    for (const ejercicio of sesion.ejercicios) {
      const clave = normalizarEjercicio(ejercicio.nombre);
      if (!clave) continue;
      let marca = marcas.get(clave);
      if (!marca) {
        marca = { nombre: ejercicio.nombre, mejorSerie: null, pesoMaximo: 0, vecesEntrenado: 0, ultimaVez: null };
        marcas.set(clave, marca);
      }
      const conDatos = ejercicio.series.filter((s) => (s.pesoKg ?? 0) > 0 && (s.repeticiones ?? 0) > 0);
      if (conDatos.length === 0) continue;

      marca.vecesEntrenado++;
      marca.ultimaVez = { fecha: sesion.fecha, series: conDatos };

      for (const serie of conDatos) {
        const peso = serie.pesoKg ?? 0;
        const reps = serie.repeticiones ?? 0;
        if (peso > marca.pesoMaximo) marca.pesoMaximo = peso;
        const rm = unoRMEstimado(peso, reps);
        if (!marca.mejorSerie || rm > marca.mejorSerie.unoRM) {
          marca.mejorSerie = { pesoKg: peso, repeticiones: reps, unoRM: rm, fecha: sesion.fecha };
        }
      }
    }
  }
  return marcas;
}

export interface PuntoProgresion {
  fecha: ISODate;
  etiqueta: string;
  /** Peso más alto de esa sesión. */
  pesoMaximo: number;
  /** 1RM estimado de la mejor serie de esa sesión — la comparación honesta entre días de reps distintas. */
  unoRM: number;
  volumen: number;
}

/** Serie temporal de un ejercicio, un punto por sesión en que aparece. */
export function progresionDe(sesiones: Sesion[], nombre: string): PuntoProgresion[] {
  const clave = normalizarEjercicio(nombre);
  const puntos: PuntoProgresion[] = [];

  for (const sesion of [...sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const series = sesion.ejercicios
      .filter((e) => normalizarEjercicio(e.nombre) === clave)
      .flatMap((e) => e.series)
      .filter((s) => (s.pesoKg ?? 0) > 0);
    if (series.length === 0) continue;

    const pesoMaximo = Math.max(...series.map((s) => s.pesoKg ?? 0));
    const unoRM = Math.max(...series.map((s) => unoRMEstimado(s.pesoKg, s.repeticiones)));
    const [, mes, dia] = sesion.fecha.split("-");
    puntos.push({
      fecha: sesion.fecha,
      etiqueta: `${Number(dia)}/${Number(mes)}`,
      pesoMaximo,
      unoRM: Math.round(unoRM * 10) / 10,
      volumen: volumenSeries(series),
    });
  }
  return puntos;
}

/** Todos los nombres de ejercicio vistos, del más entrenado al menos. */
export function ejerciciosConocidos(sesiones: Sesion[]): string[] {
  const conteo = new Map<string, { nombre: string; veces: number }>();
  for (const s of sesiones) {
    for (const e of s.ejercicios) {
      const clave = normalizarEjercicio(e.nombre);
      if (!clave) continue;
      const actual = conteo.get(clave);
      if (actual) actual.veces++;
      else conteo.set(clave, { nombre: e.nombre, veces: 1 });
    }
  }
  return [...conteo.values()].sort((a, b) => b.veces - a.veces).map((x) => x.nombre);
}

/** Resumen de una sesión para las tarjetas del historial. */
export function resumirSesion(sesion: Sesion) {
  const series = sesion.ejercicios.flatMap((e) => e.series);
  return {
    ejercicios: sesion.ejercicios.length,
    series: series.length,
    volumen: volumenSeries(series),
    pesoMaximo: series.reduce((max, s) => Math.max(max, s.pesoKg ?? 0), 0),
  };
}

/**
 * Cuántas veces has roto tu marca. Recorre las sesiones en orden y cuenta cada
 * vez que el 1RM estimado de un ejercicio supera todo lo anterior — sin contar
 * la primera vez que lo haces, porque estrenar un ejercicio no es un récord.
 */
export function contarRecords(sesiones: Sesion[]): number {
  const mejorPorEjercicio = new Map<string, number>();
  let records = 0;

  for (const sesion of [...sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    for (const ejercicio of sesion.ejercicios) {
      const clave = normalizarEjercicio(ejercicio.nombre);
      if (!clave) continue;
      const mejorDeHoy = ejercicio.series.reduce(
        (max, s) => Math.max(max, unoRMEstimado(s.pesoKg, s.repeticiones)),
        0
      );
      if (mejorDeHoy <= 0) continue;
      const previo = mejorPorEjercicio.get(clave);
      if (previo === undefined) {
        mejorPorEjercicio.set(clave, mejorDeHoy);
        continue;
      }
      if (mejorDeHoy > previo) {
        records++;
        mejorPorEjercicio.set(clave, mejorDeHoy);
      }
    }
  }
  return records;
}
