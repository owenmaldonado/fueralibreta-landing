// Pruebas de la lógica pura de la app personal (/app/mi-dia). Nada aquí toca
// Supabase ni React: son las reglas del juego (fechas, estados, rachas,
// puntos, nivel, 1RM y correlaciones), que es donde un error se ve tarde y mal
// — una racha mal calculada no truena, solo miente.
//
// Corre con: npm test

import {
  aISO, diaSemana, diasEntre, inicioSemana, rango, semanaDe, sumarDias, sumarMeses,
} from "@/lib/personal/fechas";
import {
  aplicaEn, calcularRacha, estadoDe, nivelDe, puntosDe, resumirPeriodo, unoRMEstimado, volumenSeries,
} from "@/lib/personal/reglas";
import { contarRecords, marcasPorEjercicio, normalizarEjercicio, progresionDe } from "@/lib/personal/gym";
import { armarSerie, comparaciones } from "@/lib/personal/correlaciones";
import type { Dia, Habito, RegistroHabito, Sesion } from "@/lib/personal/tipos";

let fallos = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { console.log("FALLO:", msg, "\n  esperado:", jb, "\n  obtuvo:  ", ja); fallos++; }
  else console.log("ok:", msg);
}

// ===========================================================================
// FECHAS — la trampa del ISO corto interpretado como UTC
// ===========================================================================

// new Date("2026-08-29") sería medianoche UTC = 28 de agosto en México. Si
// aDate() cayera en eso, TODA la app se recorrería un día por las tardes.
eq(diaSemana("2026-08-29"), 6, "2026-08-29 es sábado (no viernes: el ISO no se lee como UTC)");
eq(sumarDias("2026-02-28", 1), "2026-03-01", "2026 no es bisiesto: 28 feb + 1 = 1 marzo");
eq(sumarDias("2028-02-28", 1), "2028-02-29", "2028 si es bisiesto: 28 feb + 1 = 29 feb");
eq(sumarDias("2026-12-31", 1), "2027-01-01", "cruzar el año");
eq(sumarDias("2026-03-01", -1), "2026-02-28", "restar cruzando mes");
eq(sumarMeses("2026-01-31", 1), "2026-02-28", "31 de enero + 1 mes cae en el ultimo dia de febrero, no el 3 de marzo");
eq(sumarMeses("2028-01-31", 1), "2028-02-29", "y en año bisiesto cae en el 29");
eq(sumarMeses("2026-03-31", -1), "2026-02-28", "31 de marzo - 1 mes tambien se recorta");
eq(diasEntre("2026-08-01", "2026-08-29"), 28, "dias entre dos fechas");
eq(inicioSemana("2026-08-29"), "2026-08-24", "la semana del sabado 29 empieza el lunes 24");
eq(inicioSemana("2026-08-30"), "2026-08-24", "el DOMINGO 30 pertenece a la semana que empezo el lunes 24");
eq(semanaDe("2026-08-30")[6], "2026-08-30", "el domingo es el ultimo dia de la semana, no el primero");
eq(rango("2026-08-01", "2026-08-03"), ["2026-08-01", "2026-08-02", "2026-08-03"], "rango inclusivo");
eq(rango("2026-08-03", "2026-08-01"), [], "rango invertido no cicla para siempre");

// Un cambio de horario de verano no debe perder ni duplicar un dia.
{
  const dias = rango("2026-03-28", "2026-04-08");
  eq(dias.length, 12, "12 dias seguidos alrededor del cambio de horario, sin saltos");
  eq(new Set(dias).size, 12, "y sin repetidos");
}

// aISO sobre un Date local siempre regresa ese mismo dia local.
eq(aISO(new Date(2026, 7, 29, 23, 30)), "2026-08-29", "23:30 del 29 sigue siendo el 29");

// ===========================================================================
// HÁBITOS — estados, dias que no tocan, rachas
// ===========================================================================

const diario: Habito = {
  id: "h1", nombre: "Agua", emoji: null, categoria: null,
  dificultad: "facil", diasSemana: null, metaSemanal: null, activo: true, orden: 0,
};
// Lunes, miércoles y viernes.
const lmv: Habito = { ...diario, id: "h2", nombre: "Gym", dificultad: "dificil", diasSemana: [1, 3, 5] };

eq(aplicaEn(diario, "2026-08-30"), true, "un habito sin dias_semana aplica hasta en domingo");
eq(aplicaEn(lmv, "2026-08-31"), true, "lunes 31: el habito L-M-V si toca");
eq(aplicaEn(lmv, "2026-08-30"), false, "domingo 30: el habito L-M-V no toca");

function reg(fecha: string, cumplido: boolean, motivo: string | null = null): RegistroHabito {
  return { id: fecha, habitoId: "h1", fecha, cumplido, motivo, puntos: cumplido ? 5 : 0 };
}

eq(estadoDe(diario, "2026-08-29", undefined), "pendiente", "sin registro = pendiente");
eq(estadoDe(diario, "2026-08-29", reg("2026-08-29", true)), "cumplido", "cumplido = verde");
eq(estadoDe(diario, "2026-08-29", reg("2026-08-29", false, "me desvele")), "justificado", "con motivo = naranja");
eq(estadoDe(diario, "2026-08-29", reg("2026-08-29", false, null)), "fallado", "sin motivo = rojo");
eq(estadoDe(diario, "2026-08-29", reg("2026-08-29", false, "   ")), "fallado", "un motivo en blanco NO justifica");
eq(estadoDe(lmv, "2026-08-30", undefined), "no-aplica", "domingo del habito L-M-V no cuenta");

// --- La regla central: el motivo NO rompe la racha, la falta muda sí --------
{
  // 5 dias seguidos cumplidos, terminando hoy.
  const registros = new Map<string, RegistroHabito>();
  for (let i = 4; i >= 0; i--) registros.set(sumarDias("2026-08-29", -i), reg(sumarDias("2026-08-29", -i), true));
  const r = calcularRacha(diario, registros, { desde: "2026-08-25", hasta: "2026-08-29" });
  eq(r.actual, 5, "5 dias cumplidos = racha de 5");
  eq(r.mejor, 5, "y la mejor tambien es 5");
}
{
  // Igual, pero el dia de en medio fue "no cumplido CON motivo".
  const registros = new Map<string, RegistroHabito>();
  for (let i = 4; i >= 0; i--) {
    const f = sumarDias("2026-08-29", -i);
    registros.set(f, i === 2 ? reg(f, false, "gripa") : reg(f, true));
  }
  eq(calcularRacha(diario, registros, { desde: "2026-08-25", hasta: "2026-08-29" }).actual, 5,
     "un dia justificado NO rompe la racha");
}
{
  // Igual, pero el dia de en medio fue "no cumplido SIN motivo".
  const registros = new Map<string, RegistroHabito>();
  for (let i = 4; i >= 0; i--) {
    const f = sumarDias("2026-08-29", -i);
    registros.set(f, i === 2 ? reg(f, false, null) : reg(f, true));
  }
  const r = calcularRacha(diario, registros, { desde: "2026-08-25", hasta: "2026-08-29" });
  eq(r.actual, 2, "un dia fallado SI rompe la racha: quedan los 2 posteriores");
  eq(r.mejor, 2, "la mejor corrida tambien fue de 2");
}
{
  // Un dia pasado que nunca se marco tambien rompe: una racha que sobrevive a
  // los dias que ni abriste la app no es una racha.
  const registros = new Map<string, RegistroHabito>();
  registros.set("2026-08-25", reg("2026-08-25", true));
  registros.set("2026-08-29", reg("2026-08-29", true));
  eq(calcularRacha(diario, registros, { desde: "2026-08-25", hasta: "2026-08-29" }).actual, 1,
     "los dias sin marcar en medio rompen la racha");
}
{
  // HOY sin marcar todavia no rompe nada: el dia no ha terminado.
  const registros = new Map<string, RegistroHabito>();
  for (let i = 3; i >= 1; i--) registros.set(sumarDias("2026-08-29", -i), reg(sumarDias("2026-08-29", -i), true));
  eq(calcularRacha(diario, registros, { desde: "2026-08-26", hasta: "2026-08-29" }).actual, 3,
     "hoy sin marcar no rompe la racha (el dia no ha acabado)");
}
{
  // El habito L-M-V con lunes/miercoles/viernes cumplidos: los cuatro dias que
  // no tocaban no cuentan como fallas.
  const registros = new Map<string, RegistroHabito>();
  for (const f of ["2026-08-24", "2026-08-26", "2026-08-28"]) registros.set(f, reg(f, true));
  eq(calcularRacha(lmv, registros, { desde: "2026-08-24", hasta: "2026-08-28" }).actual, 3,
     "L-M-V cumplido: racha de 3, los dias que no tocaban se saltan");
}

// --- Porcentaje del mes ----------------------------------------------------
{
  const registros = new Map<string, RegistroHabito>();
  registros.set("2026-08-24", reg("2026-08-24", true));
  registros.set("2026-08-25", reg("2026-08-25", false, "trabajo"));
  registros.set("2026-08-26", reg("2026-08-26", false, null));
  const r = resumirPeriodo(diario, semanaDe("2026-08-24"), registros);
  eq([r.aplicables, r.cumplidos, r.justificados, r.fallados, r.pendientes], [7, 1, 1, 1, 4],
     "resumen de la semana cuenta cada estado");
  eq(r.porcentaje, 14, "1 de 7 = 14% (un mal dia baja el numero, no lo tira a cero)");
}
{
  // Un habito L-M-V solo puede fallar 3 dias de 7.
  const r = resumirPeriodo(lmv, semanaDe("2026-08-24"), new Map());
  eq(r.aplicables, 3, "en una semana, un habito L-M-V solo tiene 3 dias aplicables");
}

// ===========================================================================
// PUNTOS Y NIVEL
// ===========================================================================

eq([puntosDe("facil"), puntosDe("media"), puntosDe("dificil")], [5, 10, 20], "puntos por dificultad");
eq(nivelDe(0).nivel, 1, "cero puntos = nivel 1");
eq(nivelDe(499).nivel, 1, "499 puntos siguen siendo nivel 1");
eq(nivelDe(500).nivel, 2, "500 puntos = nivel 2");
eq(nivelDe(500).puntosEnNivel, 0, "y arranca el nivel 2 en cero");
eq(nivelDe(750).progreso, 50, "750 puntos = mitad del nivel 2");
eq(nivelDe(750).puntosParaSiguiente, 250, "faltan 250 para el nivel 3");
eq(nivelDe(2000).nivel, 5, "2000 puntos = nivel 5");
eq(typeof nivelDe(99999).nombre, "string", "un nivel altisimo sigue teniendo nombre (no undefined)");

// ===========================================================================
// GYM
// ===========================================================================

eq(volumenSeries([{ pesoKg: 50, repeticiones: 10 }, { pesoKg: 60, repeticiones: 5 }]), 800, "volumen = suma de peso x reps");
eq(volumenSeries([{ pesoKg: null, repeticiones: 10 }]), 0, "una serie sin peso no aporta volumen");
eq(Math.round(unoRMEstimado(60, 5) * 100) / 100, 70, "1RM de 60x5 = 70 (Epley)");
eq(unoRMEstimado(null, 5), 0, "sin peso no hay 1RM");
// Lo que hace util al 1RM: comparar dias de reps distintas.
eq(unoRMEstimado(60, 5) > unoRMEstimado(50, 10), true, "60x5 vale mas que 50x10");
eq(normalizarEjercicio("  Press Banca  "), "press banca", "el nombre del ejercicio se normaliza");
eq(normalizarEjercicio("Sentadilla") === normalizarEjercicio("SENTADILLA"), true, "mayusculas dan igual");

function sesion(fecha: string, ejercicio: string, series: [number, number][]): Sesion {
  return {
    id: fecha, fecha, nombre: "Torso", rutinaId: null, duracionMin: null, sensacion: null, notas: null,
    ejercicios: [{
      id: `${fecha}-e`, sesionId: fecha, nombre: ejercicio, orden: 0, notas: null,
      series: series.map(([peso, reps], i) => ({
        id: `${fecha}-s${i}`, ejercicioId: `${fecha}-e`, numero: i + 1, pesoKg: peso, repeticiones: reps, rpe: null,
      })),
    }],
  };
}

const historial: Sesion[] = [
  sesion("2026-06-01", "Press banca", [[40, 10], [40, 8]]),
  sesion("2026-07-01", "Press banca", [[45, 8], [45, 8]]),
  sesion("2026-08-01", "PRESS BANCA", [[50, 8], [45, 10]]),
];

{
  const marca = marcasPorEjercicio(historial).get("press banca")!;
  eq(marca.pesoMaximo, 50, "el peso maximo historico es 50");
  eq(marca.mejorSerie?.pesoKg, 50, "la mejor serie es la de 50x8");
  eq(marca.vecesEntrenado, 3, "tres sesiones con ese ejercicio, aunque una venga en mayusculas");
  eq(marca.ultimaVez?.fecha, "2026-08-01", "la ultima vez es la mas reciente");
}
{
  // "¿Cual era mi record ANTES de esta sesion?" — lo que decide si hoy hubo PR.
  const previa = marcasPorEjercicio(historial, "2026-08-01").get("press banca")!;
  eq(previa.pesoMaximo, 45, "antes del 1 de agosto el maximo era 45");
  eq(previa.ultimaVez?.fecha, "2026-07-01", "y la vez pasada habia sido el 1 de julio");
}
eq(contarRecords(historial), 2, "estrenar no cuenta: 3 sesiones en progresion = 2 records rotos");
eq(contarRecords([historial[0]]), 0, "una sola sesion no es un record");
{
  const puntos = progresionDe(historial, "press banca");
  eq(puntos.length, 3, "un punto de progresion por sesion");
  eq(puntos.map((p) => p.pesoMaximo), [40, 45, 50], "y van en orden cronologico");
  eq(puntos[0].etiqueta, "1/6", "la etiqueta es dia/mes");
}

// ===========================================================================
// CORRELACIONES — el guardia contra sacar conclusiones de tres dias
// ===========================================================================

function dia(fecha: string, animo: number, horasSueno: number | null): Dia {
  return {
    id: fecha, fecha, clima: null, animo, energia: null, horasSueno, vasosAgua: 0, pesoKg: null,
    desayuno: null, comida: null, cena: null, snacks: null,
    focoDelDia: null, gratitud: null, notaDestacada: null, cerrado: true,
  };
}

{
  // 4 dias con gym (animo 5) y 4 sin (animo 2): suficiente para comparar.
  const dias: Dia[] = [];
  const conGym = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const f = sumarDias("2026-08-01", i);
    const entreno = i < 4;
    if (entreno) conGym.add(f);
    dias.push(dia(f, entreno ? 5 : 2, 8));
  }
  const serie = armarSerie(dias, new Map(), conGym);
  eq(serie.length, 8, "la serie toma los 8 dias con animo registrado");
  const gym = comparaciones(serie).find((c) => c.clave === "gym")!;
  eq(gym.suficiente, true, "4 dias de cada lado alcanzan para comparar");
  eq([gym.promedioCon, gym.promedioSin, gym.delta], [5, 2, 3], "los dias con gym promedian 3 puntos mas");
}
{
  // Solo 2 dias con gym: NO se muestra un numero, se dice que faltan datos.
  const dias: Dia[] = [];
  const conGym = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const f = sumarDias("2026-08-01", i);
    if (i < 2) conGym.add(f);
    dias.push(dia(f, i < 2 ? 5 : 2, 8));
  }
  const gym = comparaciones(armarSerie(dias, new Map(), conGym)).find((c) => c.clave === "gym")!;
  eq(gym.suficiente, false, "con 2 dias de un lado NO se declara una correlacion");
}
{
  // Un dia sin animo registrado no entra a la serie (no hay nada que correlacionar).
  const dias = [dia("2026-08-01", 4, 8), { ...dia("2026-08-02", 4, 8), animo: null }];
  eq(armarSerie(dias, new Map(), new Set()).length, 1, "los dias sin animo se quedan fuera de la serie");
}

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
if (fallos > 0) process.exit(1);
