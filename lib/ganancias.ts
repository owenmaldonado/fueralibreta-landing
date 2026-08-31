import type { Dish, FondaOrder, GrocerySale } from "./types";

/**
 * "¿Cuánto de lo que vendí es mío?" — una sola respuesta para Fondita y
 * Abarrotera.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Esta cuenta vivía escrita a mano dentro de app/app/gastos/page.tsx, en dos
 * ramas (una por giro) de las que colgaban tres tarjetas y tres gráficas. Es
 * la función más delicada de la app — es la que le dice al dueño si está
 * ganando — y no tenía una sola prueba. Aquí es una función pura, con
 * scripts/pruebas/ganancias.ts encima.
 *
 * EL CONCEPTO QUE FALTABA: "ingreso sin costo conocido"
 *
 * Poner el costo de cada platillo/producto es OPCIONAL, y mucha gente no lo
 * va a hacer nunca (o lo va a hacer solo en la mitad de su menú). Así que
 * toda línea vendida cae en una de dos cubetas:
 *
 *   - CON costo capturado  -> su margen se sabe: precio − costo.
 *   - SIN costo capturado  -> su margen NO se sabe. Ni cero ni completo:
 *                             desconocido.
 *
 * Qué hacer con la segunda cubeta es una DECISIÓN, y las dos apps ya la
 * tenían tomada de forma distinta desde antes (ver `SinCosto` abajo). Lo que
 * faltaba no era unificarlas: era poder DECIRLO en pantalla, y que la
 * tarjeta "Costo de lo vendido" dejara de inventar costos.
 *
 * EL BUG QUE CIERRA
 * "Costo de lo vendido" se calculaba restando: `ventas − ganancia`. En
 * Fondita, donde una línea sin costo aporta $0 de margen, esa resta declaraba
 * que el platillo sin costo había costado EXACTAMENTE su precio de venta — la
 * pantalla inventaba un costo que nadie capturó, y encima el peor posible. Un
 * cargo extra de "para llevar" ($10, sin ningún costo asociado) salía en la
 * tarjeta como $10 de costo de mercancía.
 *
 * Por eso aquí el costo se SUMA directo (`costoConocido`) y nunca se deduce
 * de una resta.
 *
 * UN COSTO DE $0 NO ES UN COSTO CAPTURADO
 * Mismo criterio que usa la pantalla para decidir si el negocio "capturó
 * costos" (`costo != null && costo > 0`). Nada de lo que vende una fonda o
 * una abarrotera cuesta literalmente cero, así que un 0 ahí siempre
 * significa "no lo puse", no "me salió gratis".
 */

/** Una línea vendida, ya normalizada: lo que se cobró y lo que costó (si se sabe). */
export interface LineaVendida {
  /** Lo cobrado por esta línea completa (precio unitario × cantidad, o un cargo extra). */
  ingreso: number;
  /** Lo que costó esta línea completa. `undefined` = no hay costo capturado. */
  costo?: number;
}

/**
 * Qué hacer con una línea cuyo costo nadie capturó. Las dos apps ya venían
 * con una decisión distinta y este cambio NO la mueve:
 *
 * - "sin-margen" (Fondita): no aporta margen. No se le inventa un costo, así
 *   que tampoco se le puede calcular ganancia. La pantalla ya lo explicaba
 *   ("agrega costo a tus platillos para ver ganancia real").
 *
 * - "margen-completo" (Abarrotera, igual que Barbería en /app/caja): su venta
 *   cuenta entera como margen. Sobreestima, y por eso la pantalla ahora avisa
 *   con cuánto pasó — que es justo lo que barbería ya hacía y abarrotera no.
 *
 * Unificarlas cambiaría de golpe la ganancia histórica de todos los negocios
 * que ya están operando, y ninguna de las dos es "la correcta": lo que estaba
 * mal era no decirlo.
 */
export type SinCosto = "sin-margen" | "margen-completo";

export interface ResumenGanancia {
  /** Todo lo cobrado. */
  ingreso: number;
  /** Lo que de verdad costó lo vendido — SUMA de costos capturados, nunca una resta. */
  costoConocido: number;
  /** La ganancia bruta según la convención elegida (ver SinCosto). */
  margen: number;
  /** Lo cobrado por líneas SIN costo capturado — para poder avisarlo en pantalla. */
  ingresoSinCosto: number;
}

/** Un costo solo cuenta como capturado si es un número mayor a cero — ver la nota de arriba. */
export function costoCapturado(valor: number | null | undefined): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

export function resumirLineas(lineas: LineaVendida[], sinCosto: SinCosto): ResumenGanancia {
  let ingreso = 0;
  let costoConocido = 0;
  let margen = 0;
  let ingresoSinCosto = 0;

  for (const linea of lineas) {
    ingreso += linea.ingreso;
    if (linea.costo == null) {
      ingresoSinCosto += linea.ingreso;
      if (sinCosto === "margen-completo") margen += linea.ingreso;
      continue;
    }
    costoConocido += linea.costo;
    margen += linea.ingreso - linea.costo;
  }

  return { ingreso, costoConocido, margen, ingresoSinCosto };
}

/**
 * Líneas de un pedido de Fondita.
 *
 * precioUnitario/costoUnitario son el snapshot del momento del pedido (ver
 * OrderItem): editarle el precio o el costo a un platillo DESPUÉS no debe
 * mover un pedido ya cobrado. Los pedidos de antes de ese snapshot no lo
 * traen y caen al platillo de hoy — es lo único que hay para el histórico.
 *
 * `extraMonto` (el "para llevar", el envase) SÍ entra como ingreso: está
 * dentro del total que se le cobró al cliente (ver el cálculo del total en
 * components/quick-add/fonda-quick-add.tsx), así que dejarlo fuera haría que
 * Ventas y Ganancia hablaran de pedidos distintos. Va como línea sin costo
 * capturado, que es exactamente lo que es: se cobró, y nadie registró cuánto
 * costó el envase. Se suma UNA VEZ por línea, no por cantidad.
 */
export function lineasDePedidoFonda(pedido: FondaOrder, platillosPorId: Map<string, Dish>): LineaVendida[] {
  const lineas: LineaVendida[] = [];

  for (const it of pedido.items) {
    if (it.precioUnitario != null) {
      const costoUnit = costoCapturado(it.costoUnitario);
      lineas.push({
        ingreso: it.precioUnitario * it.cantidad,
        costo: costoUnit != null ? costoUnit * it.cantidad : undefined,
      });
    } else {
      const platillo = platillosPorId.get(it.platilloId);
      // Platillo borrado del menú Y pedido de antes del snapshot: no hay de
      // dónde sacar precio ni costo. Se omite la línea en vez de inventar un
      // cero; "Ventas" sigue saliendo de pedido.total, que no depende de esto.
      if (!platillo) continue;
      const extra = it.varianteNombre ? platillo.variantes?.find((v) => v.valor === it.varianteNombre)?.precioExtra ?? 0 : 0;
      const costoUnit = costoCapturado(platillo.costo);
      lineas.push({
        ingreso: (platillo.precio + extra) * it.cantidad,
        costo: costoUnit != null ? costoUnit * it.cantidad : undefined,
      });
    }

    if (it.extraMonto) lineas.push({ ingreso: it.extraMonto });
  }

  return lineas;
}

/**
 * Líneas de una venta de Abarrotera.
 *
 * costoUnitario es el snapshot del momento de la venta (ver GrocerySaleItem);
 * las ventas de antes de ese campo caen al costo ACTUAL del producto, que es
 * lo único que hay para el histórico.
 */
export function lineasDeVentaAbarrotes(venta: GrocerySale, costoPorProducto: Map<string, number>): LineaVendida[] {
  return venta.items.map((it) => {
    const costoUnit =
      costoCapturado(it.costoUnitario) ?? costoCapturado(it.productoId ? costoPorProducto.get(it.productoId) : undefined);
    return {
      ingreso: it.precioUnitario * it.cantidad,
      costo: costoUnit != null ? costoUnit * it.cantidad : undefined,
    };
  });
}

/** Resumen listo de un pedido de Fondita (convención "sin-margen", ver SinCosto). */
export function gananciaDePedidoFonda(pedido: FondaOrder, platillosPorId: Map<string, Dish>): ResumenGanancia {
  return resumirLineas(lineasDePedidoFonda(pedido, platillosPorId), "sin-margen");
}

/** Resumen listo de una venta de Abarrotera (convención "margen-completo", ver SinCosto). */
export function gananciaDeVentaAbarrotes(venta: GrocerySale, costoPorProducto: Map<string, number>): ResumenGanancia {
  return resumirLineas(lineasDeVentaAbarrotes(venta, costoPorProducto), "margen-completo");
}
