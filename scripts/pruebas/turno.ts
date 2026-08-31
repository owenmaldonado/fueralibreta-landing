import { desdeCuandoCuenta, enTurnoActual, enTurnoActualPorDiaYHora, gastoEnTurnoActual, huboCierreHoy, inicioDelTurno } from "@/lib/turno";

let fallos = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { console.log("FALLO:", msg, "\n  esperado:", jb, "\n  obtuvo:  ", ja); fallos++; }
  else console.log("ok:", msg);
}

const TZ = "America/Mexico_City";
const HOY = "2026-08-31";

// Negocio que cerró turno AYER a las 8pm (hora de México = 02:00 UTC del 31).
const cerroAyer = { turnoCerradoEn: "2026-08-31T02:00:00Z", turnoFondaCerradoEn: null, timezone: TZ };
// Negocio que cerró HOY a las 2pm (= 20:00 UTC).
const cerroHoy = { turnoCerradoEn: "2026-08-31T20:00:00Z", turnoFondaCerradoEn: null, timezone: TZ };
// Negocio que nunca ha cerrado nada.
const nuncaCerro = { turnoCerradoEn: null, turnoFondaCerradoEn: null, timezone: TZ };

// ---------------------------------------------------------------------------
// EL BUG DE FONDA: "en vez de aparecer con 0 apareció con la cuenta de ayer"
// ---------------------------------------------------------------------------
// Ayer se cerró a las 8pm y después entró un pedido a las 8:30pm. Ese pedido
// es posterior a la marca del cierre, así que con la regla vieja (que solo
// miraba "posterior al cierre") seguía contando hoy, mañana y siempre.
const ventaDeAyerDespuesDelCierre = { creadoEn: "2026-08-31T02:30:00Z" }; // ayer 8:30pm MX
eq(enTurnoActual(ventaDeAyerDespuesDelCierre, cerroAyer, HOY), false,
  "una venta de AYER posterior al cierre de ayer NO cuenta hoy (el bug de fonda)");

// Y lo de hoy sí cuenta, aunque el último cierre sea de ayer.
const ventaDeHoy = { creadoEn: "2026-08-31T16:00:00Z" }; // hoy 10am MX
eq(enTurnoActual(ventaDeHoy, cerroAyer, HOY), true,
  "una venta de HOY sí cuenta cuando el último cierre fue ayer");

// ---------------------------------------------------------------------------
// El bug anterior que NO se debe reintroducir: segundo turno del mismo día
// ---------------------------------------------------------------------------
const ventaDeLaManana = { creadoEn: "2026-08-31T15:00:00Z" }; // hoy 9am MX, antes del cierre de las 2pm
const ventaDeLaTarde  = { creadoEn: "2026-08-31T22:00:00Z" }; // hoy 4pm MX, después del cierre
eq(enTurnoActual(ventaDeLaManana, cerroHoy, HOY), false,
  "lo del turno de la mañana NO se vuelve a contar en el de la tarde");
eq(enTurnoActual(ventaDeLaTarde, cerroHoy, HOY), true,
  "lo vendido después del cierre sí cuenta en el turno nuevo");

// Sin ningún cierre: cuenta todo lo de hoy y nada de ayer.
eq(enTurnoActual(ventaDeHoy, nuncaCerro, HOY), true, "sin cierres previos, lo de hoy cuenta");
eq(enTurnoActual(ventaDeAyerDespuesDelCierre, nuncaCerro, HOY), false, "sin cierres previos, lo de ayer no cuenta");

// ---------------------------------------------------------------------------
// EL BUG DE LOS $300 EN BARBERÍA
// ---------------------------------------------------------------------------
// Cierre hoy a las 2pm MX. Una cita AGENDADA a las 8pm pero ya cobrada a la
// 1pm (antes del cierre). Con la regla vieja se comparaba "20:00" > "14:00"
// y volvía a contar en el turno nuevo sin que nadie hiciera nada.
const citaTardeYaCobrada = {
  fecha: HOY,
  hora: "20:00",
  cobradoEn: "2026-08-31T19:00:00Z", // hoy 1pm MX, ANTES del cierre de las 2pm
};
eq(enTurnoActualPorDiaYHora(citaTardeYaCobrada, cerroHoy, HOY), false,
  "cita agendada a las 8pm pero cobrada antes del cierre NO reaparece (los $300)");

// El caso espejo: cita de la mañana cobrada después del cierre. El dinero
// entró en el turno nuevo, así que tiene que contar.
const citaMananaCobradaTarde = {
  fecha: HOY,
  hora: "10:00",
  cobradoEn: "2026-08-31T23:00:00Z", // hoy 5pm MX, DESPUÉS del cierre
};
eq(enTurnoActualPorDiaYHora(citaMananaCobradaTarde, cerroHoy, HOY), true,
  "cita de las 10am cobrada después del cierre SÍ cuenta en el turno nuevo");

// Cita de ayer ya cobrada: no se arrastra al día siguiente.
const citaDeAyer = { fecha: "2026-08-30", hora: "11:00", cobradoEn: "2026-08-31T03:00:00Z" };
eq(enTurnoActualPorDiaYHora(citaDeAyer, cerroAyer, HOY), false,
  "una cita de ayer no se arrastra al turno de hoy");

// ---------------------------------------------------------------------------
// Citas viejas sin cobradoEn: se conserva el criterio de antes (día + hora)
// para no borrar histórico de golpe, pero ya limitado a hoy.
// ---------------------------------------------------------------------------
const citaViejaDeHoyDespues = { fecha: HOY, hora: "16:00" };
const citaViejaDeHoyAntes = { fecha: HOY, hora: "09:00" };
const citaViejaDeAyer = { fecha: "2026-08-30", hora: "23:00" };
eq(enTurnoActualPorDiaYHora(citaViejaDeHoyDespues, cerroHoy, HOY), true,
  "cita vieja (sin cobradoEn) de hoy posterior al cierre cuenta");
eq(enTurnoActualPorDiaYHora(citaViejaDeHoyAntes, cerroHoy, HOY), false,
  "cita vieja de hoy anterior al cierre no cuenta");
eq(enTurnoActualPorDiaYHora(citaViejaDeAyer, cerroAyer, HOY), false,
  "cita vieja de AYER no se arrastra a hoy");

// ---------------------------------------------------------------------------
// Movimientos sin instante: caen al día, como antes.
// ---------------------------------------------------------------------------
eq(enTurnoActual({ fecha: HOY }, cerroHoy, HOY), true, "movimiento sin instante, de hoy: cuenta");
eq(enTurnoActual({ fecha: "2026-08-30" }, cerroHoy, HOY), false, "movimiento sin instante, de ayer: no cuenta");

// ---------------------------------------------------------------------------
// La marca genérica y la vieja de fonda tienen que dar el mismo resultado.
// ---------------------------------------------------------------------------
const soloMarcaVieja = { turnoCerradoEn: null, turnoFondaCerradoEn: "2026-08-31T20:00:00Z", timezone: TZ };
eq(enTurnoActual(ventaDeLaManana, soloMarcaVieja, HOY), false,
  "un negocio de fonda con solo la marca vieja se comporta igual");
eq(inicioDelTurno(soloMarcaVieja)?.toISOString(), "2026-08-31T20:00:00.000Z",
  "inicioDelTurno cae a turnoFondaCerradoEn si no hay marca genérica");

// ---------------------------------------------------------------------------
// Zona horaria: la medianoche que importa es la del NEGOCIO, no la del aparato.
// ---------------------------------------------------------------------------
// México es UTC-6 todo el año (ya no hay horario de verano desde 2022), así
// que la medianoche del 31 en el negocio son las 06:00Z.
eq(enTurnoActual({ creadoEn: "2026-08-31T06:00:00Z" }, nuncaCerro, HOY), true,
  "medianoche del negocio: cuenta como hoy aunque en UTC ya sea otra hora");
// 2026-08-31T05:00:00Z = 30 de agosto 11pm en México -> todavía es AYER.
eq(enTurnoActual({ creadoEn: "2026-08-31T05:00:00Z" }, nuncaCerro, HOY), false,
  "las 11pm de ayer en el negocio no cuentan hoy, aunque en UTC ya sea día 31");

// ---------------------------------------------------------------------------
// GASTOS POR TURNO (Owen: "los gastos no se van a 0, se cuenta lo de todo el
// día en vez de iniciar en cero... lo mismo con abarrotera")
// ---------------------------------------------------------------------------
const AYER = "2026-08-30";
const MANANA = "2026-09-01";

// El caso exacto reportado: cerré el turno de la mañana a las 2pm, y el de la
// tarde seguía arrastrando el gasto que ya se había entregado en el corte
// anterior.
const gastoDeLaManana = { fecha: HOY, creadoEn: "2026-08-31T15:00:00Z" }; // 9am MX
const gastoDeLaTarde = { fecha: HOY, creadoEn: "2026-08-31T22:00:00Z" }; // 4pm MX
eq(gastoEnTurnoActual(gastoDeLaManana, cerroHoy, HOY), false,
  "el gasto del turno de la mañana NO se vuelve a contar en el de la tarde");
eq(gastoEnTurnoActual(gastoDeLaTarde, cerroHoy, HOY), true,
  "el gasto hecho después del cierre sí cuenta en el turno nuevo");

// Sin ningún cierre, el turno es el día entero.
eq(gastoEnTurnoActual(gastoDeLaManana, nuncaCerro, HOY), true,
  "sin cierres previos, el gasto de hoy cuenta");

// Nada de ayer se cuela, haya o no cierre de por medio.
eq(gastoEnTurnoActual({ fecha: AYER, creadoEn: "2026-08-31T02:30:00Z" }, cerroAyer, HOY), false,
  "un gasto de AYER posterior al cierre de ayer no cuenta hoy");
eq(gastoEnTurnoActual({ fecha: AYER, creadoEn: "2026-08-31T02:30:00Z" }, nuncaCerro, HOY), false,
  "un gasto de ayer no cuenta hoy ni sin cierres previos");

// Gasto PROGRAMADO a futuro: se captura hoy pero el dinero sale otro día, así
// que no toca la caja de hoy. Manda `fecha`, no el instante de captura.
eq(gastoEnTurnoActual({ fecha: MANANA, creadoEn: "2026-08-31T22:00:00Z" }, cerroHoy, HOY), false,
  "un gasto programado para mañana no cuenta en el turno de hoy");

// Compatibilidad: gastos de antes de la migración 20260925000000 no tienen
// instante. Se siguen contando, como antes, en vez de desaparecer del corte.
eq(gastoEnTurnoActual({ fecha: HOY }, cerroHoy, HOY), true,
  "un gasto viejo sin instante se sigue contando (no desaparece del corte)");
eq(gastoEnTurnoActual({ fecha: HOY, creadoEn: null }, cerroHoy, HOY), true,
  "created_at en null se trata igual que ausente");
eq(gastoEnTurnoActual({ fecha: HOY, creadoEn: "no-es-una-fecha" }, cerroHoy, HOY), true,
  "un instante corrupto no hace desaparecer el gasto");

// Un gasto capturado en el mismo milisegundo del cierre pertenece al turno que
// se cerró, no al nuevo — si no, contaría en los dos.
eq(gastoEnTurnoActual({ fecha: HOY, creadoEn: "2026-08-31T20:00:00Z" }, cerroHoy, HOY), false,
  "el gasto justo en el instante del cierre queda del lado del turno cerrado");

// La marca vieja de fonda funciona igual que la genérica.
eq(gastoEnTurnoActual(gastoDeLaManana, soloMarcaVieja, HOY), false,
  "con solo la marca vieja de fonda, el gasto de la mañana tampoco se repite");

// ---------------------------------------------------------------------------
// La etiqueta "desde cuándo cuenta este turno" tiene que decir la verdad
// ---------------------------------------------------------------------------
// Con el último cierre AYER, hoy el turno arranca cuando abrieron — no en la
// hora de ese cierre. Antes la etiqueta anunciaba una ventana que incluía toda
// la noche de ayer, mientras el cálculo real no la incluía.
eq(desdeCuandoCuenta(cerroAyer, TZ, HOY), "Desde que abrieron hoy",
  "con el cierre de ayer, hoy la etiqueta dice 'desde que abrieron'");
eq(desdeCuandoCuenta(nuncaCerro, TZ, HOY), "Desde que abrieron hoy",
  "sin cierres, la etiqueta dice 'desde que abrieron'");
eq(desdeCuandoCuenta(cerroHoy, TZ, HOY).startsWith("Desde el último cierre"), true,
  "con un cierre de hoy sí se nombra la hora del cierre");
eq(huboCierreHoy(cerroHoy, HOY), true, "huboCierreHoy detecta el cierre de hoy");
eq(huboCierreHoy(cerroAyer, HOY), false, "huboCierreHoy no confunde el cierre de ayer");
eq(huboCierreHoy(nuncaCerro, HOY), false, "huboCierreHoy sin cierres es false");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
if (fallos > 0) process.exit(1);
