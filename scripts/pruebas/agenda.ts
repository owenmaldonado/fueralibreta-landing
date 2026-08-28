import { getDaySlots, getAvailableSlotsForDuracion } from "@/lib/agenda";

let fallos = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { console.log("FALLO:", msg, "\n  esperado:", jb, "\n  obtuvo:  ", ja); fallos++; }
  else console.log("ok:", msg);
}

// Viernes 2026-09-04, negocio abierto 09:00-13:00 (8 slots), sin comida.
const FECHA = "2026-09-04";
const base = {
  horario: [{ dia: "Vie", abierto: true, inicio: "09:00", fin: "13:00" }],
  excepciones: [],
  servicios: [
    { id: "s30",  nombre: "Corte",  duracion_min: 30 },
    { id: "s45",  nombre: "Barba",  duracion_min: 45 },
    { id: "s115", nombre: "Uñas",   duracion_min: 115 },
    { id: "s60",  nombre: "Tinte",  duracion_min: 60 },
  ],
  citas: [] as any[],
} as any;

const TZ = "America/Mexico_City";
const conCitas = (citas: any[]) => ({ ...base, citas });
const ocupados = (citas: any[]) =>
  getDaySlots(conCitas(citas), FECHA, TZ).filter(s => s.estado === "ocupado").map(s => s.hora);

// --- lo que pidió Owen: 45 min bloquea 1 hora entera ---
eq(ocupados([{ fecha: FECHA, hora: "09:00", estado: "pendiente", servicioId: "s45" }]),
   ["09:00","09:30"], "servicio de 45 min bloquea 1 HORA entera (09:00 y 09:30)");

// --- 115 min redondea a 2 horas ---
eq(ocupados([{ fecha: FECHA, hora: "09:00", estado: "pendiente", servicioId: "s115" }]),
   ["09:00","09:30","10:00","10:30"], "servicio de 115 min bloquea 2 HORAS enteras");

// --- 60 min exactos NO se pasan de la raya ---
eq(ocupados([{ fecha: FECHA, hora: "09:00", estado: "pendiente", servicioId: "s60" }]),
   ["09:00","09:30"], "servicio de 60 min bloquea exactamente 1 hora, no 1:30");

eq(ocupados([{ fecha: FECHA, hora: "09:00", estado: "pendiente", servicioId: "s30" }]),
   ["09:00"], "servicio de 30 min bloquea 1 slot");

// --- servicio desconocido: media hora por default, no cero ---
eq(ocupados([{ fecha: FECHA, hora: "10:00", estado: "pendiente", servicioId: "no-existe" }]),
   ["10:00"], "servicio sin duracion conocida bloquea al menos su slot");

// --- una cita guardada a una hora fuera de la rejilla (walk-in viejo) igual tapa su bloque ---
// 9:17 + 30min = 9:47, que se mete en el bloque de las 9:30 -> tapa los dos.
eq(ocupados([{ fecha: FECHA, hora: "09:17", estado: "pendiente", servicioId: "s30" }]),
   ["09:00","09:30"], "cita a las 9:17 tapa 9:00 y 9:30 (antes no tapaba NADA)");

// --- LO NUEVO: una venta ya cobrada NO aparta horario ---
eq(ocupados([{ fecha: FECHA, hora: "09:47", estado: "listo", servicioId: "s45" }]),
   [], "venta rapida ya cobrada (listo) NO ocupa ningun hueco");
eq(ocupados([{ fecha: FECHA, hora: "09:00", estado: "cancelada", servicioId: "s45" }]),
   [], "cita cancelada no ocupa");

// dos walk-ins en la misma media hora: ninguno tapa nada, la agenda sigue libre
eq(ocupados([
    { fecha: FECHA, hora: "09:05", estado: "listo", servicioId: "s30" },
    { fecha: FECHA, hora: "09:20", estado: "listo", servicioId: "s30" },
   ]), [], "dos walk-ins seguidos en la misma media hora: agenda intacta");

// --- el picker con duracion: donde SI cabe el servicio completo ---
// cita pendiente de 30 min a las 11:00 -> tapa 11:00
const conCita11 = [{ fecha: FECHA, hora: "11:00", estado: "pendiente", servicioId: "s30" }];
// desde 9:30 necesitaria 9:30-11:00, y 11:00 esta ocupado -> solo 9:00.
eq(getAvailableSlotsForDuracion(conCitas(conCita11), FECHA, 115, TZ),
   ["09:00"], "115 min solo cabe empezando a las 9:00: cualquier otro arranque choca con la cita de las 11:00");
eq(getAvailableSlotsForDuracion(conCitas(conCita11), FECHA, 45, TZ),
   ["09:00","09:30","10:00","11:30","12:00"], "45 min: se cae 10:30 (chocaria con las 11:00) y 12:30 (no cabe antes de cerrar)");
// ojo: 12:30 + 45min se pasa de las 13:00 -> NO deberia ofrecerse
const libres45 = getAvailableSlotsForDuracion(conCitas([]), FECHA, 45, TZ);
eq(libres45.includes("12:30"), false, "45 min NO se ofrece a las 12:30 (no cabe antes de cerrar a las 13:00)");

// --- respeta la hora de comida ---
const conComida = { ...base, horario: [{ dia: "Vie", abierto: true, inicio: "09:00", fin: "13:00", comidaInicio: "11:00", comidaFin: "12:00" }] };
eq(getAvailableSlotsForDuracion(conComida as any, FECHA, 60, TZ),
   ["09:00","09:30","10:00","12:00"], "60 min respeta la comida de 11-12 y el cierre");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
