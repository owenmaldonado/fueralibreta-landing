"use client";

import { toast } from "sonner";

import { supabase, isSupabaseConfigured } from "./supabase";
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

  // AQUÍ IBA clearDemoPreview(), Y ERA UN BUG.
  //
  // Owen: "solo quiero que el número que anoté en la demo se pase al iniciar
  // sesión, que no tenga que escribirlo".
  //
  // El flujo que se rompía: armas tu demo en /demo/[tipo] (ahí te pregunta
  // tu WhatsApp), le picas a "Prueba 7 días gratis", y para entrar con la
  // cuenta correcta tienes que cambiar de cuenta primero. Ese cambio de
  // cuenta pasa por aquí — y borraba la demo que acababas de armar. Al
  // llegar a /onboarding ya no había nada que precargar, así que te pedía
  // nombre y número otra vez, desde cero.
  //
  // Se le nota a quien maneja varias cuentas (Owen tiene tres, una por
  // giro): siempre hay un cambio de cuenta entre armar la demo y crear el
  // negocio, así que para él NUNCA se precargaba.
  //
  // Dejarla NO hace que la app entre en modo demo sola: eso lo decide
  // `fl_demo_preview_active`, un flag de sessionStorage que solo se prende
  // con ?preview=true (ver estaEnModoPreview en lib/session.ts) y que muere
  // al cerrar la pestaña. Lo que queda en localStorage es solo el borrador
  // para rellenar el formulario de alta — datos que la propia persona acaba
  // de escribir en este mismo dispositivo, no el catálogo de un negocio
  // real, que sí se borra arriba con limpiarCacheLocal().
  //
  // /onboarding lo consume y lo limpia él mismo cuando el negocio se crea.
  if (isSupabaseConfigured) {
    await supabase.auth.signOut();
  }
  push("/login");
}
