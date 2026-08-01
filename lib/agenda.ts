import { todayISO } from "./mock";
import type { Appointment, BarberiaData } from "./types";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

type SlotSource = Pick<BarberiaData, "horario" | "excepciones"> & {
  citas: Pick<Appointment, "fecha" | "hora" | "estado">[];
};

/** Calcula los huecos disponibles reales según horario, excepciones y citas ya tomadas. */
export function getAvailableSlots(barberia: SlotSource, fecha: string): string[] {
  const date = new Date(`${fecha}T00:00:00`);
  const diaCodigo = DIAS_SEMANA[date.getDay()];
  const horarioDia = barberia.horario.find((h) => h.dia === diaCodigo);
  const excepcion = barberia.excepciones.find((e) => e.fecha === fecha);

  if (excepcion?.cerrado) return [];
  if (!horarioDia || !horarioDia.abierto) return [];

  const [ih, im] = horarioDia.inicio.split(":").map(Number);
  const finStr = excepcion?.horaEspecialFin ?? horarioDia.fin;
  const [fh, fm] = finStr.split(":").map(Number);

  const slots: string[] = [];
  let h = ih;
  let m = im;
  while (h < fh || (h === fh && m < fm)) {
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 30;
    if (m >= 60) {
      m -= 60;
      h += 1;
    }
  }

  const ocupados = new Set(barberia.citas.filter((c) => c.fecha === fecha && c.estado !== "cancelada").map((c) => c.hora));
  const esHoy = fecha === todayISO(0);
  const ahora = new Date();

  return slots.filter((s) => {
    if (ocupados.has(s)) return false;
    if (esHoy) {
      const [sh, sm] = s.split(":").map(Number);
      const slotDate = new Date(date);
      slotDate.setHours(sh, sm, 0, 0);
      if (slotDate.getTime() <= ahora.getTime()) return false;
    }
    return true;
  });
}
