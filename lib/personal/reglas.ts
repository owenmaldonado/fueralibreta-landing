// ============================================================================
// Las reglas del juego: puntos, estados de un hábito, rachas y nivel.
//
// Todo aquí es PURO (entra data, sale un número) — sin Supabase, sin React.
// Por eso se puede probar de un jalón desde scripts/pruebas/mi-dia.ts.
// ============================================================================

import { diaSemana, diasEntre, hoy, sumarDias, type ISODate } from "./fechas";
import type { Dificultad, EstadoHabito, Habito, RegistroHabito } from "./tipos";

/** Puntos por cumplir un hábito, según qué tanto cuesta. */
export const PUNTOS_POR_DIFICULTAD: Record<Dificultad, number> = {
  facil: 5,
  media: 10,
  dificil: 20,
};

export const ETIQUETA_DIFICULTAD: Record<Dificultad, string> = {
  facil: "Fácil",
  media: "Media",
  dificil: "Difícil",
};

export function puntosDe(dificultad: Dificultad): number {
  return PUNTOS_POR_DIFICULTAD[dificultad] ?? PUNTOS_POR_DIFICULTAD.media;
}

/** ¿Este hábito toca este día? (dias_semana null = todos los días.) */
export function aplicaEn(habito: Pick<Habito, "diasSemana">, fecha: ISODate): boolean {
  if (!habito.diasSemana || habito.diasSemana.length === 0) return true;
  return habito.diasSemana.includes(diaSemana(fecha));
}

/**
 * Estado de un hábito en un día concreto. Los tres colores del tracker salen
 * de aquí:
 *   cumplido    → verde
 *   justificado → naranja (no cumplido PERO con motivo escrito)
 *   fallado     → rojo (no cumplido y sin motivo)
 *   pendiente   → gris (todavía no lo marcas; hoy y el futuro empiezan así)
 *   no-aplica   → transparente (ese día ni tocaba, ver aplicaEn)
 */
export function estadoDe(
  habito: Pick<Habito, "diasSemana">,
  fecha: ISODate,
  registro: RegistroHabito | undefined
): EstadoHabito {
  if (!aplicaEn(habito, fecha)) return "no-aplica";
  if (!registro) return "pendiente";
  if (registro.cumplido) return "cumplido";
  return registro.motivo && registro.motivo.trim() ? "justificado" : "fallado";
}

/** ¿Este estado mantiene viva la racha? Un día justificado NO la rompe: ese es el punto. */
export function sostieneRacha(estado: EstadoHabito): boolean {
  return estado === "cumplido" || estado === "justificado" || estado === "no-aplica";
}

export interface Racha {
  /** Días seguidos (contando solo los días en que el hábito aplica) sin fallar. */
  actual: number;
  /** La racha más larga que se haya logrado en el historial que se le pase. */
  mejor: number;
}

/**
 * Racha de un hábito. Camina hacia atrás desde `hasta` (por default, hoy).
 *
 * Dos decisiones que importan:
 *  - Un día "no-aplica" se salta sin sumar ni romper: si el gym es L-M-V, el
 *    domingo no cuenta como día de racha ni la corta.
 *  - Un "pendiente" HOY no rompe la racha (el día no ha terminado); un
 *    pendiente de un día pasado sí — nunca lo registraste, y una racha que
 *    sobrevive a los días que ni abriste la app no es una racha.
 */
export function calcularRacha(
  habito: Pick<Habito, "diasSemana">,
  registros: Map<ISODate, RegistroHabito>,
  opciones: { desde: ISODate; hasta?: ISODate } = { desde: "" }
): Racha {
  const hasta = opciones.hasta ?? hoy();
  const desde = opciones.desde || sumarDias(hasta, -365);

  let corrida = 0;
  let mejor = 0;

  const total = Math.max(0, diasEntre(desde, hasta));
  // Se recorre del pasado al presente para poder medir "mejor" de paso; la
  // racha ACTUAL es la corrida que quede viva al llegar a `hasta`.
  for (let i = 0; i <= total; i++) {
    const fecha = sumarDias(desde, i);
    const estado = estadoDe(habito, fecha, registros.get(fecha));

    if (estado === "no-aplica") continue;
    if (estado === "pendiente" && fecha === hasta) continue; // el día no ha acabado

    if (sostieneRacha(estado)) {
      corrida++;
      if (corrida > mejor) mejor = corrida;
    } else {
      corrida = 0;
    }
  }

  return { actual: corrida, mejor };
}

export interface ResumenHabitoPeriodo {
  /** Días del periodo en que el hábito sí tocaba. */
  aplicables: number;
  cumplidos: number;
  justificados: number;
  fallados: number;
  pendientes: number;
  /** 0-100. Como en Way of Life: un mal día baja el porcentaje, no lo tira a cero. */
  porcentaje: number;
  puntos: number;
}

export function resumirPeriodo(
  habito: Pick<Habito, "diasSemana">,
  fechas: ISODate[],
  registros: Map<ISODate, RegistroHabito>
): ResumenHabitoPeriodo {
  const r: ResumenHabitoPeriodo = {
    aplicables: 0, cumplidos: 0, justificados: 0, fallados: 0, pendientes: 0, porcentaje: 0, puntos: 0,
  };
  for (const fecha of fechas) {
    const estado = estadoDe(habito, fecha, registros.get(fecha));
    if (estado === "no-aplica") continue;
    r.aplicables++;
    if (estado === "cumplido") r.cumplidos++;
    else if (estado === "justificado") r.justificados++;
    else if (estado === "fallado") r.fallados++;
    else r.pendientes++;
    r.puntos += registros.get(fecha)?.puntos ?? 0;
  }
  r.porcentaje = r.aplicables === 0 ? 0 : Math.round((r.cumplidos / r.aplicables) * 100);
  return r;
}

// ---------------------------------------------------------------------------
// Nivel
// ---------------------------------------------------------------------------

export const PUNTOS_POR_NIVEL = 500;

/**
 * Nombres del nivel. No son decoración: un número solo ("nivel 7") no dice
 * nada, y ver que pasaste de "Constante" a "En forma" sí. Después del último
 * se repite el último nombre — el nivel sigue subiendo, el título ya no.
 */
const NOMBRES_NIVEL = [
  "Arrancando", "Constante", "En ritmo", "Disciplinado", "En forma",
  "Imparable", "De acero", "Élite", "Leyenda",
];

export interface NivelInfo {
  nivel: number;
  nombre: string;
  puntosTotales: number;
  /** Puntos ya ganados dentro del nivel actual. */
  puntosEnNivel: number;
  /** Cuántos faltan para el siguiente. */
  puntosParaSiguiente: number;
  /** 0-100, para la barra de progreso. */
  progreso: number;
}

export function nivelDe(puntosTotales: number): NivelInfo {
  const puntos = Math.max(0, Math.floor(puntosTotales));
  const nivel = Math.floor(puntos / PUNTOS_POR_NIVEL) + 1;
  const puntosEnNivel = puntos % PUNTOS_POR_NIVEL;
  return {
    nivel,
    nombre: NOMBRES_NIVEL[Math.min(nivel - 1, NOMBRES_NIVEL.length - 1)],
    puntosTotales: puntos,
    puntosEnNivel,
    puntosParaSiguiente: PUNTOS_POR_NIVEL - puntosEnNivel,
    progreso: Math.round((puntosEnNivel / PUNTOS_POR_NIVEL) * 100),
  };
}

// ---------------------------------------------------------------------------
// Gym: volumen y récords
// ---------------------------------------------------------------------------

/** Kilos totales movidos: suma de peso × reps de cada serie. La métrica honesta de "qué tan dura estuvo". */
export function volumenSeries(series: { pesoKg: number | null; repeticiones: number | null }[]): number {
  return series.reduce((acc, s) => acc + (s.pesoKg ?? 0) * (s.repeticiones ?? 0), 0);
}

/**
 * 1RM estimado (fórmula de Epley): peso × (1 + reps/30).
 * Permite comparar 60kg×5 contra 50kg×10 — sin esto, "progresión" solo se
 * puede leer si siempre haces las mismas reps, que nunca pasa.
 */
export function unoRMEstimado(pesoKg: number | null, reps: number | null): number {
  if (!pesoKg || !reps) return 0;
  return pesoKg * (1 + reps / 30);
}
