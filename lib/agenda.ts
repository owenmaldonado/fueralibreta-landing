import { hoyEnZona, horaActualEnZona } from "./fecha";
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
 *
 * `timezone` (negocios.timezone) decide qué es "hoy" y qué hora "ya pasó"
 * — sin pasarla, cae a la zona del dispositivo que ejecuta esto (bien en
 * el navegador de México, MAL en un servidor que corre en UTC, como la
 * validación server-side de /api/public/citas). Pásala siempre que la
 * tengas a mano.
 */
export function getDaySlots(barberia: SlotSource, fecha: string, timezone?: string): SlotDetallado[] {
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

  // Qué slots quedan tapados por una cita.
  //
  // 1) Se bloquea TODO el rango que la cita cubre, no solo el slot donde
  //    empieza — y redondeando SIEMPRE hacia arriba al bloque de 30 min:
  //    un servicio de 45 min a las 9:00 tapa 9:00 y 9:30 (una hora entera,
  //    porque una cita nueva a las 9:30 sí se traslaparía); uno de 115 min
  //    tapa 9:00, 9:30, 10:00 y 10:30 (dos horas). Es lo que hace el
  //    `min < inicio + duracion` de abajo: la última vuelta entra aunque
  //    solo sobren 15 minutos de servicio.
  //
  // 2) Solo cuentan las citas PENDIENTES. Una cita ya cobrada ("listo") es
  //    trabajo terminado: el barbero está libre otra vez, así que no tiene
  //    por qué seguir tapando un hueco. Esto es lo que deja que la Venta
  //    rápida (un walk-in que se cobra al momento, se guarda como cita ya
  //    "listo") no consuma horario: se pueden cobrar dos, tres o los
  //    walk-ins que lleguen dentro de la misma media hora, y la agenda y la
  //    página pública de reservas siguen ofreciendo ese hueco tal cual.
  //    "cancelada" nunca contó y sigue sin contar.
  const duracionPorServicio = new Map(barberia.servicios.map((s) => [s.id, s.duracion_min]));
  const ocupados = new Set<string>();
  for (const c of barberia.citas) {
    if (c.fecha !== fecha || c.estado !== "pendiente") continue;
    const duracion = duracionPorServicio.get(c.servicioId) ?? 30;
    const inicio = minutosDeHora(c.hora);
    // Alinea el arranque al bloque de 30 min que contiene la hora de la
    // cita: si por lo que sea quedó guardada a las 9:17 (una cita vieja, o
    // una importada), tapa desde las 9:00 — nunca "9:17", que no existe en
    // la rejilla y por lo tanto no taparía nada.
    const arranque = Math.floor(inicio / 30) * 30;
    for (let min = arranque; min < inicio + duracion; min += 30) {
      ocupados.add(horaDeMinutos(min));
    }
  }
  const esHoy = fecha === hoyEnZona(timezone);
  const horaActual = horaActualEnZona(timezone);

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
    } else if (esHoy && hora <= horaActual) {
      estado = "pasado";
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
export function getAvailableSlots(barberia: SlotSource, fecha: string, timezone?: string): string[] {
  return getDaySlots(barberia, fecha, timezone)
    .filter((s) => s.estado === "libre")
    .map((s) => s.hora);
}

/**
 * Igual que getAvailableSlots, pero exige que TODO el rango [inicio,
 * inicio+duracion) esté libre — no solo el slot de arranque. Antes, un
 * servicio largo (ej. uñas, 120 min) podía agendarse a las 9:00 aunque ya
 * hubiera otra cita a las 10:30 (dentro de esas 2 horas): el picker solo
 * miraba si 9:00 en sí estaba ocupado, sin ver que el servicio se
 * traslaparía con algo más adelante. También respeta que la cita completa
 * no se salga de la hora de comida ni del cierre del negocio. Úsala en vez
 * de getAvailableSlots en cuanto se conozca la duración del servicio a
 * agendar (Nueva Cita del dueño y reserva pública /b/[slug]).
 */
export function getAvailableSlotsForDuracion(barberia: SlotSource, fecha: string, duracionMin: number, timezone?: string): string[] {
  const dia = getDaySlots(barberia, fecha, timezone);
  const pasos = Math.max(1, Math.ceil(duracionMin / 30));

  return dia
    .filter((_, i) => {
      for (let k = 0; k < pasos; k++) {
        if (dia[i + k]?.estado !== "libre") return false;
      }
      return true;
    })
    .map((s) => s.hora);
}

/** "Lun".."Dom" del día de la semana al que cae una fecha ISO — mismo índice que HorarioDia.dia. */
export function diaCodigoDeFecha(fecha: string): (typeof DIAS_SEMANA)[number] {
  return DIAS_SEMANA[new Date(`${fecha}T00:00:00`).getDay()];
}
