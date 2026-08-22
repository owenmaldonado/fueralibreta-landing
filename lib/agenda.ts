import { todayISO } from "./mock";
import type { Appointment, BarberiaData } from "./types";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

type SlotSource = Pick<BarberiaData, "horario" | "excepciones" | "servicios"> & {
  citas: Pick<Appointment, "fecha" | "hora" | "estado" | "servicioId">[];
};

function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function horaDeMinutos(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type EstadoSlot = "libre" | "ocupado" | "comida" | "pasado";

export interface SlotDetallado {
  hora: string;
  estado: EstadoSlot;
}

function enRango(hora: string, desde: string, hasta: string): boolean {
  return hora >= desde && hora < hasta;
}

/**
 * Todos los slots de media hora del horario del día (abierto..cerrado),
 * cada uno con su estado real — libre, ya ocupado por una cita, dentro de
 * la hora de comida (horario no es corrido, ver comidaInicio/comidaFin en
 * HorarioDia) o ya pasado (si `fecha` es hoy). Único cálculo real: tanto
 * getAvailableSlots (reserva pública, /b/[slug]) como el picker de Nueva
 * Cita/Mover cita en la Agenda del dueño parten de aquí, para que ambos
 * respeten exactamente el mismo horario/comida/ocupación.
 */
export function getDaySlots(barberia: SlotSource, fecha: string): SlotDetallado[] {
  const date = new Date(`${fecha}T00:00:00`);
  const diaCodigo = DIAS_SEMANA[date.getDay()];
  const horarioDia = barberia.horario.find((h) => h.dia === diaCodigo);
  const excepcion = barberia.excepciones.find((e) => e.fecha === fecha);

  if (excepcion?.cerrado) return [];
  if (!horarioDia || !horarioDia.abierto) return [];

  const [ih, im] = horarioDia.inicio.split(":").map(Number);
  const finStr = excepcion?.horaEspecialFin ?? horarioDia.fin;
  const [fh, fm] = finStr.split(":").map(Number);
  const tieneComida = Boolean(horarioDia.comidaInicio && horarioDia.comidaFin);

  // Antes solo se marcaba ocupado el slot EXACTO donde empezaba la cita —
  // un servicio de 45 min a las 9:00 dejaba 9:30 libre como si el barbero
  // ya estuviera desocupado, cuando en realidad el corte sigue hasta 9:45.
  // Ahora se bloquean todos los slots de 30 min que la cita realmente cubre
  // (redondeado hacia arriba: un servicio de 45 min bloquea 9:00 Y 9:30,
  // porque una cita nueva a las 9:30 sí se traslaparía).
  const duracionPorServicio = new Map(barberia.servicios.map((s) => [s.id, s.duracion_min]));
  const ocupados = new Set<string>();
  for (const c of barberia.citas) {
    if (c.fecha !== fecha || c.estado === "cancelada") continue;
    const duracion = duracionPorServicio.get(c.servicioId) ?? 30;
    const inicio = minutosDeHora(c.hora);
    for (let min = inicio; min < inicio + duracion; min += 30) {
      ocupados.add(horaDeMinutos(min));
    }
  }
  const esHoy = fecha === todayISO(0);
  const ahora = new Date();

  const slots: SlotDetallado[] = [];
  let h = ih;
  let m = im;
  while (h < fh || (h === fh && m < fm)) {
    const hora = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    let estado: EstadoSlot = "libre";
    if (tieneComida && enRango(hora, horarioDia.comidaInicio!, horarioDia.comidaFin!)) {
      estado = "comida";
    } else if (ocupados.has(hora)) {
      estado = "ocupado";
    } else if (esHoy) {
      const slotDate = new Date(date);
      slotDate.setHours(h, m, 0, 0);
      if (slotDate.getTime() <= ahora.getTime()) estado = "pasado";
    }
    slots.push({ hora, estado });
    m += 30;
    if (m >= 60) {
      m -= 60;
      h += 1;
    }
  }

  return slots;
}

/** Calcula los huecos disponibles reales según horario, comida, excepciones y citas ya tomadas — usada por la reserva pública (/b/[slug]). */
export function getAvailableSlots(barberia: SlotSource, fecha: string): string[] {
  return getDaySlots(barberia, fecha)
    .filter((s) => s.estado === "libre")
    .map((s) => s.hora);
}

/** "Lun".."Dom" del día de la semana al que cae una fecha ISO — mismo índice que HorarioDia.dia. */
export function diaCodigoDeFecha(fecha: string): (typeof DIAS_SEMANA)[number] {
  return DIAS_SEMANA[new Date(`${fecha}T00:00:00`).getDay()];
}
