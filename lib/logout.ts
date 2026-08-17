"use client";

import { toast } from "sonner";

import { supabase, isSupabaseConfigured } from "./supabase";
import { clearDemoPreview } from "./demoPreview";
import { limpiarCacheLocal } from "./local-cache";
import { contarVentasPendientes } from "./offline-sales-queue";

/**
 * Cierra sesión (dueño o "cambiar cuenta") desde cualquier punto de entrada
 * — hoy el botón de logout del TopBar y "Cambiar cuenta / Cerrar sesión" en
 * /app/inicio comparten esta misma lógica, para no arriesgar que se les
 * olvide el guardia de ventas pendientes en alguno de los dos si un día
 * cambia. Ventas sin subir: no se puede cerrar sesión todavía — se
 * perderían (viven solo en este dispositivo hasta que la Parte 4 las suba).
 */
export async function cerrarSesion(negocioId: string, push: (href: string) => void): Promise<void> {
  const pendientes = await contarVentasPendientes(negocioId);
  if (pendientes > 0) {
    toast.error(
      `Tienes ${pendientes} ${pendientes === 1 ? "venta" : "ventas"} por sincronizar, conéctate a internet antes de salir`
    );
    return;
  }
  // Primero, y sin depender de la red: si otra persona usa este celular
  // después, no debe poder ver el catálogo del negocio anterior.
  await limpiarCacheLocal();
  clearDemoPreview();
  if (isSupabaseConfigured) {
    await supabase.auth.signOut();
  }
  push("/login");
}
