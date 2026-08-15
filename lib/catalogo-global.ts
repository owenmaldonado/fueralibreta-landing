import { supabase } from "./supabase";

/**
 * Catálogo global de productos por código de barras (ver
 * supabase/migrations/20260815010000_catalogo_global.sql) — compartido
 * entre TODOS los negocios, sin negocio_id. Nunca guarda precio/costo,
 * solo nombre (y marca/presentacion si algún día un formulario las pide;
 * el de Inventario hoy no las tiene, así que este archivo no las manda).
 * Todo lo de aquí es SECUNDARIO a propósito: si Supabase falla o el
 * usuario no tiene internet, nunca debe bloquear ni ensuciar el flujo real
 * de agregar/buscar un producto en SU inventario.
 */

export interface CatalogoGlobalEntry {
  nombre: string;
  marca: string | null;
  presentacion: string | null;
}

/** Se llama al escanear un código que no existe en el inventario del negocio, antes de pedirle al usuario que escriba el nombre a mano. */
export async function buscarEnCatalogoGlobal(codigoBarras: string): Promise<CatalogoGlobalEntry | null> {
  const codigo = codigoBarras.trim();
  if (!codigo) return null;
  try {
    const { data, error } = await supabase
      .from("catalogo_global")
      .select("nombre, marca, presentacion")
      .eq("codigo_barras", codigo)
      .maybeSingle();
    if (error || !data) return null;
    return { nombre: data.nombre as string, marca: (data.marca as string) ?? null, presentacion: (data.presentacion as string) ?? null };
  } catch (err) {
    console.error("No se pudo consultar el catálogo global (no bloqueante):", err);
    return null;
  }
}

/**
 * Se llama justo después de guardar un producto NUEVO en el inventario
 * del negocio. ignoreDuplicates: true (INSERT ... ON CONFLICT DO NOTHING)
 * a propósito — la policy de RLS solo da INSERT a cuentas autenticadas,
 * nunca UPDATE (eso es solo admin, ver /api/admin/catalogo), así que un
 * upsert que sí intente actualizar una fila existente tronaría por RLS en
 * cuanto el código ya estuviera en el catálogo (el caso más común una vez
 * que el catálogo tiene un rato poblado).
 */
export async function aportarACatalogoGlobal(codigoBarras: string, nombre: string): Promise<void> {
  const codigo = codigoBarras.trim();
  const nombreLimpio = nombre.trim();
  if (!codigo || !nombreLimpio) return;
  try {
    const { error } = await supabase
      .from("catalogo_global")
      .upsert({ codigo_barras: codigo, nombre: nombreLimpio }, { onConflict: "codigo_barras", ignoreDuplicates: true });
    if (error) console.error("No se pudo aportar al catálogo global (no bloqueante):", error);
  } catch (err) {
    console.error("No se pudo aportar al catálogo global (no bloqueante):", err);
  }
}
