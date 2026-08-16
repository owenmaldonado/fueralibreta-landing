"use client";

import { useEffect, useState } from "react";

import { InventarioDB, disponible, type TipoVentaPendiente, type VentaPendienteRow } from "./local-cache";
import type { GroceryProduct } from "./types";

export type { TipoVentaPendiente, VentaPendienteRow };

/**
 * Cola de ventas pendientes (Parte 3 de PWA) — ver el comentario de
 * VentaPendienteRow en lib/local-cache.ts para el shape exacto. Vive en la
 * MISMA base Dexie por negocio que el catálogo (Parte 2): así el borrado en
 * logout/cambio de negocio_id ya cubre esto gratis, sin duplicar esa lógica.
 */

const VENTAS_PENDIENTES_EVENT = "fl_ventas_pendientes_cambio";

function avisarCambio() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(VENTAS_PENDIENTES_EVENT));
  }
}

/**
 * Encola una venta/cobro hecho sin conexión. Para abarrotes, además persiste
 * el stock YA descontado (productosActualizados) en la misma transacción —
 * así un reload sin señal no permite vender el mismo producto dos veces.
 */
export async function encolarVentaPendiente(params: {
  id: string;
  negocioId: string;
  tipo: TipoVentaPendiente;
  payload: unknown;
  empleadoId?: string;
  empleadoNombreCache?: string;
  productosActualizados?: GroceryProduct[];
}): Promise<void> {
  if (!disponible()) return;
  const db = new InventarioDB(params.negocioId);
  try {
    await db.transaction("rw", [db.ventas_pendientes, db.grocery_productos], async () => {
      await db.ventas_pendientes.put({
        id: params.id,
        tipo: params.tipo,
        payload: params.payload,
        creadaEn: new Date().toISOString(),
        empleadoId: params.empleadoId,
        empleadoNombreCache: params.empleadoNombreCache,
      });
      if (params.productosActualizados) {
        await db.grocery_productos.bulkPut(params.productosActualizados);
      }
    });
    avisarCambio();
  } catch (err) {
    console.error("[offline-sales-queue] no se pudo encolar la venta pendiente:", err);
  } finally {
    db.close();
  }
}

export async function contarVentasPendientes(negocioId: string): Promise<number> {
  if (!disponible()) return 0;
  const db = new InventarioDB(negocioId);
  try {
    return await db.ventas_pendientes.count();
  } catch (err) {
    console.error("[offline-sales-queue] no se pudo contar la cola:", err);
    return 0;
  } finally {
    db.close();
  }
}

export async function leerVentasPendientes(negocioId: string): Promise<VentaPendienteRow[]> {
  if (!disponible()) return [];
  const db = new InventarioDB(negocioId);
  try {
    return await db.ventas_pendientes.toArray();
  } catch (err) {
    console.error("[offline-sales-queue] no se pudo leer la cola:", err);
    return [];
  } finally {
    db.close();
  }
}

/** Para el badge del TopBar y las etiquetas "Por sincronizar" del historial
 * — relee al evento de encolado (inmediato) y de respaldo cada 15s (por si
 * la Parte 4, más adelante, la vacía desde otra pestaña). */
export function usePendingSalesQueue(negocioId: string | undefined): { rows: VentaPendienteRow[]; count: number } {
  const [rows, setRows] = useState<VentaPendienteRow[]>([]);

  useEffect(() => {
    if (!negocioId) {
      setRows([]);
      return;
    }
    let cancelled = false;

    function refrescar() {
      leerVentasPendientes(negocioId!).then((r) => {
        if (!cancelled) setRows(r);
      });
    }

    refrescar();
    window.addEventListener(VENTAS_PENDIENTES_EVENT, refrescar);
    const interval = setInterval(refrescar, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener(VENTAS_PENDIENTES_EVENT, refrescar);
      clearInterval(interval);
    };
  }, [negocioId]);

  return { rows, count: rows.length };
}
