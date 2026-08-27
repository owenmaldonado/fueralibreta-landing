import { toast } from "sonner";

import { supabase } from "./supabase";
import {
  leerVentasPendientes,
  eliminarVentaPendiente,
  marcarVentaComoError,
  reintentarVentaPendiente,
  type VentaPendienteRow,
} from "./offline-sales-queue";
import { actualizarStockLocal } from "./local-cache";
import type { GrocerySale, CajaEntry, FondaOrder, Appointment } from "./types";

/**
 * Parte 4 de PWA — sube la cola de ventas pendientes (lib/offline-sales-queue.ts)
 * en cuanto hay conexión. Cada fila usa su propio `id` (UUID generado en
 * cliente) como llave primaria real en Postgres (confirmado: las 6 tablas
 * involucradas son `id uuid primary key default gen_random_uuid()`, y el
 * código YA manda ese id explícito al insertar) — así que en vez de
 * `.insert()` se usa `.upsert(fila, { onConflict: "id" })` en todo este
 * archivo: un reintento de algo que YA se subió simplemente vuelve a
 * escribir los mismos valores, sin duplicar nada y sin tener que detectar
 * "unique_violation" a mano.
 */

export const SYNC_PROGRESS_EVENT = "fl_sync_progreso";

export interface SyncProgreso {
  negocioId: string;
  actual: number;
  total: number;
}

let progresoActual: SyncProgreso | null = null;
const negociosSincronizando = new Set<string>();

function avisarProgreso(p: SyncProgreso | null) {
  progresoActual = p;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_PROGRESS_EVENT, { detail: p }));
  }
}

/** Snapshot síncrono para el primer render del hook de progreso (lib/use-sync-progress.ts). */
export function progresoDeSincronizacion(negocioId: string): SyncProgreso | null {
  return progresoActual && progresoActual.negocioId === negocioId ? progresoActual : null;
}

function mensajeDeError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  if (err instanceof Error) return err.message;
  return "Error desconocido";
}

/**
 * Heurística para distinguir "no llegó al servidor" (reintentar solo, sin
 * avisar) de "el servidor lo rechazó" (requiere revisión). No hay una señal
 * 100% confiable desde el cliente — se combina el estado actual de
 * navigator.onLine (la más confiable) con el texto del error como respaldo,
 * por si el navegador tarda un poco en reflejar la caída de red.
 */
function esErrorDeRed(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const mensaje = mensajeDeError(err).toLowerCase();
  return mensaje.includes("failed to fetch") || mensaje.includes("network") || mensaje.includes("timeout") || mensaje.includes("load failed");
}

/** empleado_id apunta a un empleado ya borrado (23503, foreign_key_violation).
 * Decisión explícita del dueño: la venta vale más que quién la cobró — se
 * reintenta UNA vez sin el empleado_id (queda null, igual que ya pasa hoy
 * cuando se borra un empleado con ventas viejas: on delete set null),
 * conservando el nombre en texto para que quede constancia. Nunca se manda
 * a "requiere revisión" solo por esto. */
function esErrorDeEmpleadoBorrado(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23503" && (error.message ?? "").toLowerCase().includes("empleado_id");
}

function notaEmpleadoBorrado(nombreCache: string | null): string | null {
  if (!nombreCache) return nombreCache;
  return nombreCache.includes("(empleado original borrado)") ? nombreCache : `${nombreCache} (empleado original borrado)`;
}

interface ResultadoItem {
  ok: boolean;
  redCaida?: boolean;
  advertenciaStock?: string;
}

/**
 * Resta la CANTIDAD vendida (no un valor final calculado en cliente) contra
 * el stock real vía el RPC atómico — nunca bloquea la venta si falla por
 * algo que no sea red (ej. el producto ya no existe): la venta ya se subió,
 * el ajuste de inventario es secundario. Si falla por red, si propaga hacia
 * arriba para que la venta completa (ya subida, upsert es idempotente) se
 * quede en la cola y el ajuste de stock se reintente junto con el resto.
 */
async function descontarStockConReconciliacion(
  negocioId: string,
  productoId: string,
  cantidad: number
): Promise<{ redCaida?: boolean; advertencia?: string }> {
  const { data, error } = await supabase.rpc("descontar_stock_atomico", {
    p_producto_id: productoId,
    p_cantidad: cantidad,
  });
  if (error) {
    if (esErrorDeRed(error)) return { redCaida: true };
    console.error("[sync-queue] no se pudo ajustar stock de", productoId, error);
    return {};
  }
  const fila = Array.isArray(data) ? data[0] : data;
  if (fila && typeof fila.stock_final === "number") {
    await actualizarStockLocal(negocioId, productoId, fila.stock_final);
  }
  if (fila && fila.alcanzaba === false) {
    return { advertencia: "se vendió sin existencias suficientes" };
  }
  return {};
}

async function subirAbarrotesVenta(negocioId: string, fila: VentaPendienteRow): Promise<ResultadoItem> {
  const venta = fila.payload as GrocerySale;
  let empleadoId = venta.empleadoId ?? null;
  let empleadoNombreCache = venta.empleadoNombreCache ?? null;

  const filaVenta = () => ({
    id: venta.id,
    negocio_id: negocioId,
    total: venta.total,
    fecha: venta.fecha,
    empleado_id: empleadoId,
    empleado_nombre_cache: empleadoNombreCache,
  });

  let { error } = await supabase.from("abarrotes_ventas").upsert(filaVenta(), { onConflict: "id" });
  if (error && esErrorDeEmpleadoBorrado(error)) {
    empleadoId = null;
    empleadoNombreCache = notaEmpleadoBorrado(empleadoNombreCache);
    ({ error } = await supabase.from("abarrotes_ventas").upsert(filaVenta(), { onConflict: "id" }));
  }
  if (error) {
    if (esErrorDeRed(error)) return { ok: false, redCaida: true };
    await marcarVentaComoError(negocioId, fila.id, mensajeDeError(error));
    return { ok: false };
  }

  if (venta.items.length > 0) {
    const itemsRows = venta.items.map((it) => ({
      id: it.id,
      venta_id: venta.id,
      producto_id: it.productoId || null,
      producto_nombre: it.productoNombre,
      cantidad: it.cantidad,
      precio_unitario: it.precioUnitario,
      subtotal: it.subtotal,
      costo_unitario: it.costoUnitario ?? null,
    }));
    const { error: errorItems } = await supabase.from("abarrotes_sale_items").upsert(itemsRows, { onConflict: "id" });
    if (errorItems) {
      if (esErrorDeRed(errorItems)) return { ok: false, redCaida: true };
      await marcarVentaComoError(negocioId, fila.id, mensajeDeError(errorItems));
      return { ok: false };
    }
  }

  const advertencias: string[] = [];
  for (const it of venta.items) {
    if (!it.productoId) continue;
    const { redCaida, advertencia } = await descontarStockConReconciliacion(negocioId, it.productoId, it.cantidad);
    // La venta y sus items YA se subieron (arriba) — si el ajuste de stock
    // se cae por red, la fila se queda en la cola: el reintento vuelve a
    // subir venta+items (idempotente, no duplica nada) y retoma el stock.
    if (redCaida) return { ok: false, redCaida: true };
    if (advertencia) advertencias.push(`${it.productoNombre}: ${advertencia}`);
  }

  return { ok: true, advertenciaStock: advertencias.length ? advertencias.join("; ") : undefined };
}

async function subirBarberiaCaja(negocioId: string, fila: VentaPendienteRow): Promise<ResultadoItem> {
  const entry = fila.payload as CajaEntry;
  let empleadoId = entry.empleadoId ?? null;
  let empleadoNombreCache = entry.empleadoNombreCache ?? null;

  const filaEntry = () => ({
    id: entry.id,
    negocio_id: negocioId,
    tipo: entry.tipo,
    concepto: entry.concepto,
    monto: entry.monto,
    metodo: entry.metodo,
    fecha: entry.fecha,
    empleado_id: empleadoId,
    empleado_nombre_cache: empleadoNombreCache,
  });

  let { error } = await supabase.from("barberia_caja").upsert(filaEntry(), { onConflict: "id" });
  if (error && esErrorDeEmpleadoBorrado(error)) {
    empleadoId = null;
    empleadoNombreCache = notaEmpleadoBorrado(empleadoNombreCache);
    ({ error } = await supabase.from("barberia_caja").upsert(filaEntry(), { onConflict: "id" }));
  }
  if (error) {
    if (esErrorDeRed(error)) return { ok: false, redCaida: true };
    await marcarVentaComoError(negocioId, fila.id, mensajeDeError(error));
    return { ok: false };
  }
  return { ok: true };
}

async function subirBarberiaCobroCita(negocioId: string, fila: VentaPendienteRow): Promise<ResultadoItem> {
  const { citaId, metodo } = fila.payload as { citaId: string; metodo: "efectivo" | "transferencia" };
  let empleadoId = fila.empleadoId ?? null;
  let empleadoNombreCache = fila.empleadoNombreCache ?? null;

  // Guardia crítico: si la cita fue CANCELADA desde otro dispositivo
  // mientras este estaba offline, un UPDATE ciego la resucitaría a
  // "listo" — el neq("estado", "cancelada") + revisar filas afectadas
  // evita eso. 0 filas = ya no aplica (cancelada, o la cita ya no existe).
  async function intentar() {
    return supabase
      .from("barberia_citas")
      .update({ estado: "listo", metodo, empleado_id: empleadoId, empleado_nombre_cache: empleadoNombreCache })
      .eq("id", citaId)
      .neq("estado", "cancelada")
      .select("id");
  }

  let { data, error } = await intentar();
  if (error && esErrorDeEmpleadoBorrado(error)) {
    empleadoId = null;
    empleadoNombreCache = notaEmpleadoBorrado(empleadoNombreCache);
    ({ data, error } = await intentar());
  }
  if (error) {
    if (esErrorDeRed(error)) return { ok: false, redCaida: true };
    await marcarVentaComoError(negocioId, fila.id, mensajeDeError(error));
    return { ok: false };
  }
  if (!data || data.length === 0) {
    await marcarVentaComoError(
      negocioId,
      fila.id,
      "Esta cita ya no existe o fue cancelada desde otro dispositivo — revisa manualmente."
    );
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Venta rápida de barbería: una cita NUEVA que ya nació cobrada ("listo",
 * sin cliente). Es un upsert de la fila completa — no el UPDATE ciego de
 * subirBarberiaCobroCita, porque aquí la cita no existía en Postgres, la
 * creó este dispositivo estando sin señal.
 */
async function subirBarberiaVentaRapida(negocioId: string, fila: VentaPendienteRow): Promise<ResultadoItem> {
  const cita = fila.payload as Appointment;
  let empleadoId = cita.empleadoId ?? null;
  let empleadoNombreCache = cita.empleadoNombreCache ?? null;

  const filaCita = () => ({
    id: cita.id,
    negocio_id: negocioId,
    // Una venta rápida no tiene cliente: cliente_id es FK a
    // barberia_clientes, así que "" tiene que viajar como null.
    cliente_id: cita.clienteId || null,
    cliente_nombre: cita.clienteNombre,
    cliente_telefono: cita.clienteTelefono ?? "",
    servicio_id: cita.servicioId || null,
    servicio_nombre: cita.servicioNombre,
    precio: cita.precio,
    fecha: cita.fecha,
    hora: cita.hora,
    estado: cita.estado,
    metodo: cita.metodo ?? null,
    empleado_id: empleadoId,
    empleado_nombre_cache: empleadoNombreCache,
  });

  let { error } = await supabase.from("barberia_citas").upsert(filaCita(), { onConflict: "id" });
  if (error && esErrorDeEmpleadoBorrado(error)) {
    empleadoId = null;
    empleadoNombreCache = notaEmpleadoBorrado(empleadoNombreCache);
    ({ error } = await supabase.from("barberia_citas").upsert(filaCita(), { onConflict: "id" }));
  }
  if (error) {
    if (esErrorDeRed(error)) return { ok: false, redCaida: true };
    await marcarVentaComoError(negocioId, fila.id, mensajeDeError(error));
    return { ok: false };
  }
  return { ok: true };
}

async function subirFondaPedido(negocioId: string, fila: VentaPendienteRow): Promise<ResultadoItem> {
  const pedido = fila.payload as FondaOrder;
  let empleadoId = pedido.empleadoId ?? null;
  let empleadoNombreCache = pedido.empleadoNombreCache ?? null;

  const filaPedido = () => ({
    id: pedido.id,
    negocio_id: negocioId,
    cliente_nombre: pedido.clienteNombre,
    cliente_telefono: pedido.clienteTelefono ?? null,
    fecha: pedido.fecha,
    hora: pedido.hora,
    hora_entrega: pedido.horaEntrega ?? null,
    estado: pedido.estado,
    total: pedido.total,
    empleado_id: empleadoId,
    empleado_nombre_cache: empleadoNombreCache,
  });

  let { error } = await supabase.from("fonda_pedidos").upsert(filaPedido(), { onConflict: "id" });
  if (error && esErrorDeEmpleadoBorrado(error)) {
    empleadoId = null;
    empleadoNombreCache = notaEmpleadoBorrado(empleadoNombreCache);
    ({ error } = await supabase.from("fonda_pedidos").upsert(filaPedido(), { onConflict: "id" }));
  }
  if (error) {
    if (esErrorDeRed(error)) return { ok: false, redCaida: true };
    await marcarVentaComoError(negocioId, fila.id, mensajeDeError(error));
    return { ok: false };
  }

  if (pedido.items.length > 0) {
    const itemsRows = pedido.items.map((it) => ({
      id: it.id,
      pedido_id: pedido.id,
      platillo_id: it.platilloId || null,
      platillo_nombre: it.platilloNombre,
      cantidad: it.cantidad,
      nota: it.nota ?? null,
      variante_nombre: it.varianteNombre ?? null,
    }));
    const { error: errorItems } = await supabase.from("fonda_pedido_items").upsert(itemsRows, { onConflict: "id" });
    if (errorItems) {
      if (esErrorDeRed(errorItems)) return { ok: false, redCaida: true };
      await marcarVentaComoError(negocioId, fila.id, mensajeDeError(errorItems));
      return { ok: false };
    }
  }
  return { ok: true };
}

async function subirUna(negocioId: string, fila: VentaPendienteRow): Promise<ResultadoItem> {
  switch (fila.tipo) {
    case "abarrotes_venta":
      return subirAbarrotesVenta(negocioId, fila);
    case "barberia_caja":
      return subirBarberiaCaja(negocioId, fila);
    case "barberia_cobro_cita":
      return subirBarberiaCobroCita(negocioId, fila);
    case "barberia_venta_rapida":
      return subirBarberiaVentaRapida(negocioId, fila);
    case "fonda_pedido":
      return subirFondaPedido(negocioId, fila);
  }
}

/**
 * Sube la cola de un negocio en orden FIFO (por creadaEn). Una venta que el
 * SERVIDOR rechaza (pasa a "error") no detiene la cola — sigue con la
 * siguiente, porque cada venta y su ajuste de stock son independientes
 * entre sí. Una falla de RED sí detiene todo (seguir intentando contra una
 * conexión caída solo generaría ruido) y deja el resto tal cual para el
 * próximo intento — que puede ser automático (reconexión, cada 2 min, o al
 * volver a la pestaña) o manual (Reintentar en el historial).
 *
 * No se llama nunca para negocios demo (ver llamadores en
 * components/app-shell/sales-sync-manager.tsx) — no hay fila real en
 * Postgres a la que subir nada.
 */
export async function sincronizarColaPendiente(negocioId: string): Promise<void> {
  if (negociosSincronizando.has(negocioId)) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const cola = (await leerVentasPendientes(negocioId)).filter((f) => f.estado !== "error");
  if (cola.length === 0) return;

  negociosSincronizando.add(negocioId);
  cola.sort((a, b) => a.creadaEn.localeCompare(b.creadaEn));

  let subidas = 0;
  let errores = 0;
  const advertencias: string[] = [];

  try {
    for (let i = 0; i < cola.length; i++) {
      avisarProgreso({ negocioId, actual: i + 1, total: cola.length });
      const resultado = await subirUna(negocioId, cola[i]);
      if (resultado.redCaida) break;
      if (resultado.ok) {
        await eliminarVentaPendiente(negocioId, cola[i].id);
        subidas++;
        if (resultado.advertenciaStock) advertencias.push(resultado.advertenciaStock);
      } else {
        errores++;
      }
    }
  } finally {
    negociosSincronizando.delete(negocioId);
    avisarProgreso(null);
  }

  if (subidas === 0 && errores === 0) return;

  if (errores > 0) {
    toast.error(`${subidas} de ${subidas + errores} ventas subidas, ${errores} requiere${errores === 1 ? "" : "n"} revisión`);
  } else {
    toast.success(subidas === 1 ? "1 venta sincronizada" : `${subidas} ventas sincronizadas`);
  }
  if (advertencias.length > 0) {
    toast.warning(`Revisa tu inventario — ${advertencias.join("; ")}`);
  }
}

/** Botón "Reintentar" del historial — reintenta UNA fila y de paso corre el ciclo completo. */
export async function reintentarUnaVenta(negocioId: string, id: string): Promise<void> {
  await reintentarVentaPendiente(negocioId, id);
  await sincronizarColaPendiente(negocioId);
}
