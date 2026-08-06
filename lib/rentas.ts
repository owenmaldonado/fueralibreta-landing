import { supabase, isSupabaseConfigured } from "./supabase";

// ============================================================================
// Módulo Rentas (/app/rentas): CRUD de propiedades sobre rentas_propiedades.
// Sin negocio/session de por medio — owner_id es quien la registró.
//
// Cada función revisa isSupabaseConfigured antes de llamar al cliente, igual
// que el resto de la app (ver lib/session.ts): sin esto, un intento de fetch
// contra el host placeholder de lib/supabase.ts se queda colgado sin
// resolver ni rechazar nunca en vez de fallar rápido con un error claro.
// ============================================================================

const SUPABASE_NO_CONFIGURADO = "Falta configurar Supabase (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).";

export type EstadoPropiedad = "disponible" | "rentada";

export interface Propiedad {
  id: string;
  nombre: string;
  direccion: string | null;
  precio: number;
  estado: EstadoPropiedad;
  createdAt: string;
}

function propiedadFromRow(row: Record<string, unknown>): Propiedad {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    direccion: (row.direccion as string) ?? null,
    precio: Number(row.precio),
    estado: row.estado as EstadoPropiedad,
    createdAt: row.created_at as string,
  };
}

export async function fetchPropiedades(): Promise<Propiedad[]> {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_NO_CONFIGURADO);
  const { data, error } = await supabase.from("rentas_propiedades").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(propiedadFromRow);
}

export interface PropiedadInput {
  nombre: string;
  direccion: string;
  precio: number;
  estado: EstadoPropiedad;
}

export async function createPropiedad(input: PropiedadInput): Promise<void> {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_NO_CONFIGURADO);
  const { data: userRes, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userRes.user) throw new Error("No hay sesión activa.");

  const { error } = await supabase.from("rentas_propiedades").insert({
    nombre: input.nombre.trim(),
    direccion: input.direccion.trim() || null,
    precio: input.precio,
    estado: input.estado,
    owner_id: userRes.user.id,
  });
  if (error) throw error;
}

export async function updatePropiedad(id: string, input: PropiedadInput): Promise<void> {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_NO_CONFIGURADO);
  const { error } = await supabase
    .from("rentas_propiedades")
    .update({
      nombre: input.nombre.trim(),
      direccion: input.direccion.trim() || null,
      precio: input.precio,
      estado: input.estado,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePropiedad(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_NO_CONFIGURADO);
  const { error } = await supabase.from("rentas_propiedades").delete().eq("id", id);
  if (error) throw error;
}
