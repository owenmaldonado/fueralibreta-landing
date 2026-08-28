import { aggregateByRange, filterByRango, semanaDe, diaDelNegocio, aggregateTwoByRange, diaDeColumnaFecha } from "@/lib/chart-buckets";

let fallos = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { console.log("FALLO:", msg, "\n  esperado:", jb, "\n  obtuvo:  ", ja); fallos++; }
  else console.log("ok:", msg);
}

// hoy = jueves 2026-08-28
const ctx = { hoy: "2026-08-28", timezone: "America/Mexico_City" };
const items = [
  { fecha: "2026-08-28", monto: 100 }, // viernes (hoy)
  { fecha: "2026-08-27", monto: 50 },  // jueves
  { fecha: "2026-08-24", monto: 10 },  // lunes
  { fecha: "2026-08-30", monto: 7 },   // domingo (fin de semana)
  { fecha: "2026-08-23", monto: 999 }, // domingo pasado -> fuera
];
const s = aggregateByRange(items, "semanal", i => i.fecha, i => i.monto, ctx);
eq(s.map(x=>x.label), ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"], "labels semanal Lun..Dom");
eq(s.map(x=>x.value), [10,0,0,50,100,0,7], "semanal: cada monto en SU día");

// El caso que se rompía: timestamptz UTC que en México todavía es el día anterior
const conHora = [{ fecha: "2026-08-28T02:00:00+00:00", monto: 33 }]; // 27 a las 20:00 en MX
const s2 = aggregateByRange(conHora, "semanal", i => i.fecha, i => i.monto, ctx);
eq(s2.find(x=>x.label==="Jue")!.value, 33, "timestamptz UTC del 28 cae en Jue 27 (día del NEGOCIO), no en Vie 28");

eq(diaDelNegocio("2026-08-28"), "2026-08-28", "fecha solo-dia se devuelve intacta");

// semanal cuando hoy ES lunes (el caso que sacaba todo de la ventana)
const sLun = aggregateByRange(items, "semanal", i => i.fecha, i => i.monto, { hoy: "2026-08-24" });
eq(sLun.map(x=>x.value), [10,0,0,50,100,0,7], "hoy=lunes: la semana sigue siendo Lun 24 .. Dom 30");

eq(semanaDe("2026-08-28"), {desde:"2026-08-24", hasta:"2026-08-30"}, "semanaDe jueves");
eq(semanaDe("2026-08-24"), {desde:"2026-08-24", hasta:"2026-08-30"}, "semanaDe lunes");
eq(semanaDe("2026-08-30"), {desde:"2026-08-24", hasta:"2026-08-30"}, "semanaDe domingo");
eq(semanaDe("2026-01-01"), {desde:"2025-12-29", hasta:"2026-01-04"}, "semanaDe cruzando el año");

// mensual: 4 semanas, dias 29-31 caen en Sem 4
const m = aggregateByRange(
  [{f:"2026-08-01",v:1},{f:"2026-08-07",v:2},{f:"2026-08-08",v:4},{f:"2026-08-21",v:8},{f:"2026-08-22",v:16},{f:"2026-08-31",v:32}],
  "mensual", i=>i.f, i=>i.v, {hoy:"2026-08-28"});
eq(m.map(x=>x.value), [3,4,8,48], "mensual: 4 semanas, dia 31 en Sem 4");

// anual: 12 meses terminando en el de hoy, cruzando el año
const a = aggregateByRange(
  [{f:"2026-08-15",v:5},{f:"2025-09-01",v:3},{f:"2025-08-31",v:99}],
  "anual", i=>i.f, i=>i.v, {hoy:"2026-08-28"});
eq(a.map(x=>x.label), ["Sep 25","Oct 25","Nov 25","Dic 25","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago"], "anual: 12 meses, año viejo etiquetado");
eq(a[0].value, 3, "anual: sep 2025 en el primer bucket");
eq(a[11].value, 5, "anual: ago 2026 en el ultimo bucket");
eq(a.reduce((s,x)=>s+x.value,0), 8, "anual: ago 2025 queda FUERA de la ventana");

// año pasado completo (el selector de histórico)
const ap = aggregateByRange([{f:"2025-01-05",v:1},{f:"2025-12-31",v:2}], "anual", i=>i.f,i=>i.v,{hoy:"2025-12-31"});
eq(ap.map(x=>x.label), ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"], "anual anclado a 31-dic da Ene..Dic");
eq(ap[0].value + ap[11].value, 3, "anual anclado: enero y diciembre dentro");

// filterByRango usa la misma ventana que la gráfica
eq(filterByRango(items,"semanal",i=>i.fecha,ctx).length, 4, "filterByRango semanal = 4 de 5");

// dos series
const t = aggregateTwoByRange([{f:"2026-08-28",a:10,b:1}], "semanal", i=>i.f, i=>({a:i.a,b:i.b}), ctx);
eq(t.find(x=>x.label==="Vie"), {label:"Vie",a:10,b:1}, "aggregateTwoByRange");

// fecha basura no truena
eq(aggregateByRange([{f:"no-es-fecha",v:5}],"semanal",i=>i.f,i=>i.v,ctx).reduce((s,x)=>s+x.value,0), 0, "fecha invalida se ignora");

// --- EL BUG DE LA GRAFICA DE FONDITA (columna `fecha` que quedo como
// timestamptz en vez de date en bases viejas). Un pedido del 28 se guarda
// como "2026-08-28T00:00:00+00:00" = medianoche UTC, que en Mexico es el 27
// a las 6pm. Leerlo como instante lo mandaba al dia anterior.
eq(diaDeColumnaFecha("2026-08-28T00:00:00+00:00"), "2026-08-28", "columna date que llego como timestamptz: se queda en SU dia, no el anterior");
eq(diaDeColumnaFecha("2026-08-28"), "2026-08-28", "columna date normal: intacta");
eq(diaDeColumnaFecha(null), "", "valor nulo no truena");

// Y el efecto en la grafica: ese pedido cae en Vie 28, no en Jue 27.
const comoLlegaDeLaBase = [{ fecha: diaDeColumnaFecha("2026-08-28T00:00:00+00:00"), monto: 190 }];
eq(aggregateByRange(comoLlegaDeLaBase, "semanal", i => i.fecha, i => i.monto, ctx).find(x => x.label === "Vie")!.value,
   190, "pedido del viernes 28 se pinta en la barra del VIERNES");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
