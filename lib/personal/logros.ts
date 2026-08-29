// ============================================================================
// Catálogo de logros.
//
// Vive en código, no en una tabla: la condición de un logro es lógica ("7 días
// seguidos con 8 vasos de agua"), y la lógica no se guarda en una columna de
// texto que después nadie puede evaluar. La base solo guarda QUÉ se desbloqueó
// y CUÁNDO (personal_logros) — el único dato que el código no puede recalcular.
//
// Agregar un logro nuevo = agregar una entrada aquí. Los ya desbloqueados no se
// tocan; los nuevos se evalúan contra todo el historial la próxima vez que
// entres a Logros, así que un logro agregado hoy puede desbloquearse con algo
// que hiciste hace meses. Eso es a propósito.
// ============================================================================

import { hoy, sumarDias, type ISODate } from "./fechas";
import { calcularRacha, nivelDe } from "./reglas";
import type { Dia, Habito, Movimiento, Objetivo, RegistroHabito } from "./tipos";

export interface ContextoLogros {
  habitos: Habito[];
  /** habitoId -> (fecha -> registro) */
  registrosPorHabito: Map<string, Map<ISODate, RegistroHabito>>;
  dias: Dia[];
  sesionesGym: { fecha: ISODate }[];
  movimientos: Movimiento[];
  objetivos: Objetivo[];
  puntosTotales: number;
  /** Récords personales rotos alguna vez (se calcula en la pantalla de Gym). */
  recordsRotos: number;
}

export interface Logro {
  clave: string;
  nombre: string;
  descripcion: string;
  icono: string;
  /** Para agrupar la vitrina. */
  familia: "constancia" | "cuerpo" | "mente" | "dinero" | "rumbo";
  /** true cuando el historial ya cumple la condición. */
  cumple: (ctx: ContextoLogros) => boolean;
}

// --- Utilidades de conteo -------------------------------------------------

/** La racha más larga lograda por CUALQUIER hábito. */
function mejorRachaGlobal(ctx: ContextoLogros): number {
  let mejor = 0;
  const desde = ctx.dias.length > 0 ? ctx.dias[ctx.dias.length - 1].fecha : sumarDias(hoy(), -365);
  for (const habito of ctx.habitos) {
    const registros = ctx.registrosPorHabito.get(habito.id) ?? new Map();
    const r = calcularRacha(habito, registros, { desde });
    if (r.mejor > mejor) mejor = r.mejor;
  }
  return mejor;
}

/** Días seguidos, hacia atrás desde hoy, en que se cumple `predicado`. */
function corridaDesdeHoy(fechas: Set<ISODate>, dias: number): boolean {
  for (let i = 0; i < dias; i++) {
    if (!fechas.has(sumarDias(hoy(), -i))) return false;
  }
  return true;
}

/** La corrida más larga de fechas consecutivas dentro de un set. */
function mejorCorrida(fechas: Set<ISODate>): number {
  let mejor = 0;
  for (const fecha of fechas) {
    // Solo se mide desde el inicio de cada corrida, para no recorrer de más.
    if (fechas.has(sumarDias(fecha, -1))) continue;
    let largo = 0;
    let cur = fecha;
    while (fechas.has(cur) && largo < 2000) {
      largo++;
      cur = sumarDias(cur, 1);
    }
    if (largo > mejor) mejor = largo;
  }
  return mejor;
}

function sesionesEnSemanaMax(ctx: ContextoLogros): number {
  const porSemana = new Map<string, number>();
  for (const s of ctx.sesionesGym) {
    // Agrupa por lunes de esa semana.
    const [a, m, d] = s.fecha.split("-").map(Number);
    const fecha = new Date(a, m - 1, d);
    const dow = fecha.getDay();
    fecha.setDate(fecha.getDate() + (dow === 0 ? -6 : 1 - dow));
    const clave = fecha.toLocaleDateString("en-CA");
    porSemana.set(clave, (porSemana.get(clave) ?? 0) + 1);
  }
  return Math.max(0, ...porSemana.values());
}

// --- El catálogo ----------------------------------------------------------

export const LOGROS: Logro[] = [
  {
    clave: "primer_dia",
    nombre: "El primer día",
    descripcion: "Registraste tu primer día completo.",
    icono: "🌱",
    familia: "constancia",
    cumple: (c) => c.dias.some((d) => d.cerrado),
  },
  {
    clave: "semana_registrada",
    nombre: "Una semana entera",
    descripcion: "7 días seguidos cerrando el día.",
    icono: "📖",
    familia: "constancia",
    cumple: (c) => mejorCorrida(new Set(c.dias.filter((d) => d.cerrado).map((d) => d.fecha))) >= 7,
  },
  {
    clave: "mes_registrado",
    nombre: "Un mes sin faltar",
    descripcion: "30 días seguidos cerrando el día.",
    icono: "🗓️",
    familia: "constancia",
    cumple: (c) => mejorCorrida(new Set(c.dias.filter((d) => d.cerrado).map((d) => d.fecha))) >= 30,
  },
  {
    clave: "racha_7",
    nombre: "Racha de 7",
    descripcion: "Un hábito sostenido 7 días seguidos.",
    icono: "🔥",
    familia: "constancia",
    cumple: (c) => mejorRachaGlobal(c) >= 7,
  },
  {
    clave: "racha_30",
    nombre: "Racha de 30",
    descripcion: "Un hábito sostenido 30 días seguidos.",
    icono: "⚡",
    familia: "constancia",
    cumple: (c) => mejorRachaGlobal(c) >= 30,
  },
  {
    clave: "racha_100",
    nombre: "Racha de 100",
    descripcion: "Cien días seguidos. Eso ya no es un hábito, es quién eres.",
    icono: "💎",
    familia: "constancia",
    cumple: (c) => mejorRachaGlobal(c) >= 100,
  },
  {
    clave: "agua_7",
    nombre: "Bien hidratado",
    descripcion: "7 días seguidos con 8 vasos de agua o más.",
    icono: "💧",
    familia: "cuerpo",
    cumple: (c) => corridaDesdeHoy(new Set(c.dias.filter((d) => d.vasosAgua >= 8).map((d) => d.fecha)), 7),
  },
  {
    clave: "sueno_7",
    nombre: "Descansado",
    descripcion: "7 días seguidos durmiendo 7 horas o más.",
    icono: "🌙",
    familia: "cuerpo",
    cumple: (c) =>
      mejorCorrida(new Set(c.dias.filter((d) => (d.horasSueno ?? 0) >= 7).map((d) => d.fecha))) >= 7,
  },
  {
    clave: "gym_10",
    nombre: "10 sesiones",
    descripcion: "Diez entrenamientos registrados.",
    icono: "🏋️",
    familia: "cuerpo",
    cumple: (c) => c.sesionesGym.length >= 10,
  },
  {
    clave: "gym_50",
    nombre: "50 sesiones",
    descripcion: "Cincuenta entrenamientos registrados.",
    icono: "🦾",
    familia: "cuerpo",
    cumple: (c) => c.sesionesGym.length >= 50,
  },
  {
    clave: "gym_100",
    nombre: "100 sesiones",
    descripcion: "Cien entrenamientos. Ya nadie te dice que no eres constante.",
    icono: "🏆",
    familia: "cuerpo",
    cumple: (c) => c.sesionesGym.length >= 100,
  },
  {
    clave: "gym_semana_4",
    nombre: "Semana de 4",
    descripcion: "Cuatro entrenamientos en una sola semana.",
    icono: "📈",
    familia: "cuerpo",
    cumple: (c) => sesionesEnSemanaMax(c) >= 4,
  },
  {
    clave: "primer_record",
    nombre: "Primer récord",
    descripcion: "Rompiste tu marca en un ejercicio.",
    icono: "🥇",
    familia: "cuerpo",
    cumple: (c) => c.recordsRotos >= 1,
  },
  {
    clave: "records_10",
    nombre: "Diez récords",
    descripcion: "Diez veces has levantado más que nunca.",
    icono: "🚀",
    familia: "cuerpo",
    cumple: (c) => c.recordsRotos >= 10,
  },
  {
    clave: "dinero_7",
    nombre: "Cuentas claras",
    descripcion: "7 días seguidos registrando lo que gastas.",
    icono: "🧾",
    familia: "dinero",
    cumple: (c) => mejorCorrida(new Set(c.movimientos.map((m) => m.fecha))) >= 7,
  },
  {
    clave: "dinero_30",
    nombre: "Un mes con cuentas",
    descripcion: "30 días seguidos registrando movimientos.",
    icono: "💰",
    familia: "dinero",
    cumple: (c) => mejorCorrida(new Set(c.movimientos.map((m) => m.fecha))) >= 30,
  },
  {
    clave: "gratitud_30",
    nombre: "Treinta gracias",
    descripcion: "Escribiste algo que agradeces en 30 días distintos.",
    icono: "🙏",
    familia: "mente",
    cumple: (c) => c.dias.filter((d) => (d.gratitud ?? "").trim().length > 0).length >= 30,
  },
  {
    clave: "animo_registrado_30",
    nombre: "Te estás escuchando",
    descripcion: "30 días con tu ánimo registrado.",
    icono: "🫀",
    familia: "mente",
    cumple: (c) => c.dias.filter((d) => d.animo != null).length >= 30,
  },
  {
    clave: "objetivos_definidos",
    nombre: "Estrella polar",
    descripcion: "Definiste tus 7 objetivos del año.",
    icono: "🧭",
    familia: "rumbo",
    cumple: (c) => {
      const anio = new Date().getFullYear();
      return c.objetivos.filter((o) => o.anio === anio && (o.texto ?? "").trim().length > 0).length >= 7;
    },
  },
  {
    clave: "nivel_5",
    nombre: "Nivel 5",
    descripcion: "2,000 puntos acumulados.",
    icono: "⭐",
    familia: "rumbo",
    cumple: (c) => nivelDe(c.puntosTotales).nivel >= 5,
  },
  {
    clave: "nivel_10",
    nombre: "Nivel 10",
    descripcion: "4,500 puntos acumulados.",
    icono: "👑",
    familia: "rumbo",
    cumple: (c) => nivelDe(c.puntosTotales).nivel >= 10,
  },
];

export const LOGROS_POR_CLAVE = new Map(LOGROS.map((l) => [l.clave, l]));

/** Claves que el historial ya cumple pero que todavía no están en la base. */
export function logrosNuevos(ctx: ContextoLogros, yaDesbloqueados: Set<string>): string[] {
  return LOGROS.filter((l) => !yaDesbloqueados.has(l.clave) && seguro(() => l.cumple(ctx))).map((l) => l.clave);
}

/**
 * Un logro con un bug (data a medias, división entre cero) no debe tumbar la
 * pantalla completa de Logros — se trata como "no cumplido" y ya.
 */
function seguro(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
