import {
  costoCapturado,
  gananciaDePedidoFonda,
  gananciaDeVentaAbarrotes,
  lineasDePedidoFonda,
  resumirLineas,
} from "@/lib/ganancias";
import type { Dish, FondaOrder, GrocerySale, OrderItem } from "@/lib/types";

let fallos = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { console.log("FALLO:", msg, "\n  esperado:", jb, "\n  obtuvo:  ", ja); fallos++; }
  else console.log("ok:", msg);
}

// ---------------------------------------------------------------------------
// Qué cuenta como "costo capturado"
// ---------------------------------------------------------------------------
eq(costoCapturado(30), 30, "un costo de $30 es un costo capturado");
eq(costoCapturado(0), undefined, "un costo de $0 NO es un costo capturado (es 'no lo puse')");
eq(costoCapturado(null), undefined, "null no es un costo capturado");
eq(costoCapturado(undefined), undefined, "undefined no es un costo capturado");
eq(costoCapturado(-5), undefined, "un costo negativo no se toma en serio");
eq(costoCapturado(NaN), undefined, "NaN no tumba la cuenta");

// ---------------------------------------------------------------------------
// Las dos convenciones para una línea sin costo capturado
// ---------------------------------------------------------------------------
const mixto = [
  { ingreso: 100, costo: 40 }, // costo conocido
  { ingreso: 60 },             // costo desconocido
];
eq(resumirLineas(mixto, "sin-margen"), { ingreso: 160, costoConocido: 40, margen: 60, ingresoSinCosto: 60 },
  "fonda: lo que no tiene costo no aporta margen, y NO se le inventa un costo");
eq(resumirLineas(mixto, "margen-completo"), { ingreso: 160, costoConocido: 40, margen: 120, ingresoSinCosto: 60 },
  "abarrotera: lo que no tiene costo cuenta completo como margen");
eq(resumirLineas([], "sin-margen"), { ingreso: 0, costoConocido: 0, margen: 0, ingresoSinCosto: 0 },
  "sin líneas, todo en cero (no NaN)");

// ---------------------------------------------------------------------------
// FONDITA
// ---------------------------------------------------------------------------
const platillos = new Map<string, Dish>([
  ["p1", { id: "p1", nombre: "Pozole", precio: 80, categoria: "Comida", activoHoy: true, costo: 30 }],
  ["p2", { id: "p2", nombre: "Agua", precio: 20, categoria: "Bebida", activoHoy: true }], // sin costo
  ["p3", { id: "p3", nombre: "Torta", precio: 50, categoria: "Comida", activoHoy: true, costo: 0 }], // costo 0 = no lo puso
  ["p4", { id: "p4", nombre: "Enchiladas", precio: 70, categoria: "Comida", activoHoy: true, costo: 25,
           variantes: [{ id: "v1", tipo: "Guiso", valor: "Pollo", precioExtra: 10, disponible: true }] }],
]);

function pedido(items: OrderItem[], total = 0): FondaOrder {
  return { id: "ped1", clienteNombre: "Ana", fecha: "2026-08-31", hora: "13:00", items, estado: "entregado", total };
}
function item(extra: Partial<OrderItem>): OrderItem {
  return { id: "i", platilloId: "p1", platilloNombre: "Pozole", cantidad: 1, ...extra };
}

// Snapshot completo: se usa el precio y el costo del momento del pedido.
eq(gananciaDePedidoFonda(pedido([item({ cantidad: 2, precioUnitario: 80, costoUnitario: 30 })]), platillos),
  { ingreso: 160, costoConocido: 60, margen: 100, ingresoSinCosto: 0 },
  "fonda: 2 pozoles a $80 que costaron $30 = $100 de margen");

// El snapshot MANDA aunque el platillo haya cambiado de precio después.
eq(gananciaDePedidoFonda(pedido([item({ cantidad: 1, precioUnitario: 60, costoUnitario: 20 })]), platillos).margen, 40,
  "fonda: un pedido viejo conserva SU precio y SU costo, no los de hoy");

// costoUnitario ausente o en cero = no se sabe: no aporta margen ni costo.
eq(gananciaDePedidoFonda(pedido([item({ precioUnitario: 80 })]), platillos),
  { ingreso: 80, costoConocido: 0, margen: 0, ingresoSinCosto: 80 },
  "fonda: sin costo capturado no hay margen conocido — y NO se declara un costo de $80");
eq(gananciaDePedidoFonda(pedido([item({ precioUnitario: 80, costoUnitario: 0 })]), platillos).ingresoSinCosto, 80,
  "fonda: un costoUnitario de 0 se trata como 'no lo puse'");

// Pedido de antes del snapshot: cae al platillo de hoy.
eq(gananciaDePedidoFonda(pedido([item({ platilloId: "p1", cantidad: 3 })]), platillos),
  { ingreso: 240, costoConocido: 90, margen: 150, ingresoSinCosto: 0 },
  "fonda: pedido viejo sin snapshot cae al platillo actual");
eq(gananciaDePedidoFonda(pedido([item({ platilloId: "p2" })]), platillos).ingresoSinCosto, 20,
  "fonda: platillo actual sin costo puesto queda como ingreso sin costo");
eq(gananciaDePedidoFonda(pedido([item({ platilloId: "p3" })]), platillos).ingresoSinCosto, 50,
  "fonda: platillo actual con costo 0 tampoco es un costo capturado");

// La variante suma su precioExtra al ingreso, y el costo del platillo aplica igual.
eq(gananciaDePedidoFonda(pedido([item({ platilloId: "p4", varianteNombre: "Pollo", cantidad: 2 })]), platillos),
  { ingreso: 160, costoConocido: 50, margen: 110, ingresoSinCosto: 0 },
  "fonda: la variante suma su extra al ingreso ((70+10)x2 - 25x2)");

// EL BUG DEL CARGO EXTRA ("para llevar"): está dentro de lo que se le cobró
// al cliente, así que cuenta como ingreso — pero NO es un costo.
const conExtra = gananciaDePedidoFonda(
  pedido([item({ cantidad: 1, precioUnitario: 80, costoUnitario: 30, extraMonto: 10, extraConcepto: "Para llevar" })]),
  platillos
);
eq(conExtra, { ingreso: 90, costoConocido: 30, margen: 50, ingresoSinCosto: 10 },
  "fonda: el cargo de 'para llevar' es ingreso sin costo — nunca $10 de costo de mercancía");
// El extra se suma UNA VEZ por línea, no por cantidad.
eq(gananciaDePedidoFonda(pedido([item({ cantidad: 5, precioUnitario: 80, costoUnitario: 30, extraMonto: 10 })]), platillos).ingreso,
  410, "fonda: el cargo extra se cobra una vez por línea, no por pieza");

// Platillo borrado del menú y pedido sin snapshot: no se inventa nada.
eq(lineasDePedidoFonda(pedido([item({ platilloId: "borrado" })]), platillos).length, 0,
  "fonda: un platillo que ya no existe y sin snapshot no aporta líneas fantasma");

// ---------------------------------------------------------------------------
// ABARROTERA
// ---------------------------------------------------------------------------
const costos = new Map<string, number>([["a1", 18], ["a2", 0]]);
function venta(items: GrocerySale["items"], total = 0): GrocerySale {
  return { id: "v1", items, total, fecha: "2026-08-31T18:00:00Z" };
}

eq(gananciaDeVentaAbarrotes(
  venta([{ id: "i1", productoId: "a1", productoNombre: "Coca", cantidad: 2, precioUnitario: 25, subtotal: 50 }]),
  costos
), { ingreso: 50, costoConocido: 36, margen: 14, ingresoSinCosto: 0 },
  "abarrotes: 2 cocas a $25 que costaron $18 = $14 de margen");

eq(gananciaDeVentaAbarrotes(
  venta([{ id: "i1", productoId: "a1", productoNombre: "Coca", cantidad: 1, precioUnitario: 25, subtotal: 25, costoUnitario: 20 }]),
  costos
).margen, 5, "abarrotes: el costo del MOMENTO de la venta le gana al costo de hoy");

// Producto sin costo capturado: cuenta completo como margen (convención de
// abarrotera/barbería), pero queda marcado para que la pantalla lo avise.
eq(gananciaDeVentaAbarrotes(
  venta([{ id: "i1", productoId: "a2", productoNombre: "Chicle", cantidad: 1, precioUnitario: 10, subtotal: 10 }]),
  costos
), { ingreso: 10, costoConocido: 0, margen: 10, ingresoSinCosto: 10 },
  "abarrotes: sin costo capturado cuenta completo como margen, y se reporta como 'sin costo'");

// Una venta a medias: parte con costo, parte sin.
eq(gananciaDeVentaAbarrotes(
  venta([
    { id: "i1", productoId: "a1", productoNombre: "Coca", cantidad: 1, precioUnitario: 25, subtotal: 25 },
    { id: "i2", productoId: "a2", productoNombre: "Chicle", cantidad: 1, precioUnitario: 10, subtotal: 10 },
  ]),
  costos
), { ingreso: 35, costoConocido: 18, margen: 17, ingresoSinCosto: 10 },
  "abarrotes: una venta mitad con costo y mitad sin reporta las dos partes");

// LA PROPIEDAD QUE LA PANTALLA NECESITA: en abarrotera la cuenta cierra sola.
// ventas − costo conocido = ganancia bruta. Si esto se rompe, las tarjetas de
// /app/gastos dejan de cuadrar a la vista.
const mixta = gananciaDeVentaAbarrotes(
  venta([
    { id: "i1", productoId: "a1", productoNombre: "Coca", cantidad: 3, precioUnitario: 25, subtotal: 75 },
    { id: "i2", productoId: "a2", productoNombre: "Chicle", cantidad: 4, precioUnitario: 10, subtotal: 40 },
  ]),
  costos
);
eq(mixta.ingreso - mixta.costoConocido, mixta.margen,
  "abarrotes: ventas − costo conocido = ganancia (la resta que hace el dueño con el dedo)");

// Y en fondita la diferencia entre esa resta y la ganancia es EXACTAMENTE el
// ingreso sin costo — el número que el aviso de pantalla nombra.
const fondaMixta = gananciaDePedidoFonda(
  pedido([
    item({ platilloId: "p1", cantidad: 1, precioUnitario: 80, costoUnitario: 30 }),
    item({ platilloId: "p2", cantidad: 1, precioUnitario: 20 }),
  ]),
  platillos
);
eq(fondaMixta.ingreso - fondaMixta.costoConocido - fondaMixta.margen, fondaMixta.ingresoSinCosto,
  "fonda: lo que 'no cuadra' en la resta es exactamente el ingreso sin costo que avisa la pantalla");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
