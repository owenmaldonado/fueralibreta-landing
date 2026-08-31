import { supabase } from "./supabase";
import { diaDeColumnaFecha } from "./chart-buckets";
import type { BusinessType, RolEmpleado } from "./types";

/**
 * Los cierres de turno/día ya guardados, para el reporte del dueño
 * (/app/cortes).
 *
 * Los tres giros escriben el corte en su propia tabla (barberia_cortes,
 * fondita_cortes, abarrotera_cortes) pero con el MISMO esqueleto de
 * columnas — se unificó cuando se hizo el corte diario. Aquí se aprovecha
 * eso: una sola forma `Corte` y un solo lector, en vez de tres pantallas
 * casi iguales.
 *
 * `diferencia` es el número que importa: efectivo contado menos lo que
 * debía haber. Negativo = faltó. Lo calcula y lo guarda el propio wizard de
 * cierre, así que este reporte no re-deriva nada — muestra exactamente lo
 * que se registró en ese momento, que es justo lo que hace que sirva para
 * revisar.
 */

export const TABLA_CORTES: Record<BusinessType, string> = {
  barberia: "barberia_cortes",
  fonda: "fondita_cortes",
  abarrotes: "abarrotera_cortes",
};

export interface Corte {
  id: string;
  fecha: string;
  creadoEn?: string;
  ventasCalculadas: number;
  fondoInicial: number | null;
  efectivoReal: number | null;
  gastos: number | null;
  /** Solo barbería. */
  propinasTotal?: number | null;
  /** Solo barbería (checklist de material del paso 2). */
  gastosMaterial?: number | null;
  /** Efectivo contado menos lo esperado. Negativo = faltó dinero. */
  diferencia: number | null;
  empleadoNombreCache?: string;
  empleadoRolCache?: RolEmpleado;
  /** Cuándo el dueño marcó este cierre como revisado. Apaga el aviso rojo; la diferencia NO cambia. */
  revisadoAt?: string | null;
  /** Por qué se dio por bueno — "le di mal el cambio a un cliente". Explica el faltante sin taparlo. */
  revisadoNota?: string | null;
}

function aNumero(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export async function fetchCortes(negocioId: string, tipo: BusinessType, limite = 60): Promise<Corte[]> {
  const { data, error } = await supabase
    .from(TABLA_CORTES[tipo])
    .select("*")
    .eq("negocio_id", negocioId)
    // created_at y no `fecha`: con dos turnos el mismo día, ordenar por
    // fecha los deja empatados y en orden arbitrario. El dueño quiere ver
    // el último cierre hasta arriba.
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id as string,
    // diaDeColumnaFecha y no `r.fecha` crudo: si esta base trae `fecha`
    // como timestamptz (pasa en instalaciones que vienen de una versión
    // vieja — ver la migración 20260915000000), leerla como instante
    // correría el cierre al día anterior. Mismo arreglo que en los pedidos.
    fecha: diaDeColumnaFecha(r.fecha),
    creadoEn: (r.created_at as string) ?? undefined,
    ventasCalculadas: Number(r.ventas_calculadas ?? 0),
    fondoInicial: aNumero(r.fondo_inicial),
    efectivoReal: aNumero(r.efectivo_real),
    gastos: aNumero(r.gastos),
    propinasTotal: aNumero(r.propinas_total),
    gastosMaterial: aNumero(r.gastos_material),
    diferencia: aNumero(r.diferencia),
    empleadoNombreCache: (r.empleado_nombre_cache as string) ?? undefined,
    empleadoRolCache: (r.empleado_rol_cache as RolEmpleado) ?? undefined,
    revisadoAt: (r.revisado_at as string | null) ?? null,
    revisadoNota: (r.revisado_nota as string | null) ?? null,
  }));
}

/**
 * Marca un cierre como revisado, con la nota del dueño.
 *
 * Solo escribe `revisado_at` y `revisado_nota`. La diferencia, el efectivo
 * contado y lo esperado NO se tocan nunca: si se pudieran corregir a mano,
 * este reporte dejaría de ser evidencia de nada. La nota explica el
 * faltante; no lo borra.
 *
 * `nota` vacía quita la marca (vuelve a salir el aviso) — sirve para
 * deshacer si se marcó por error.
 */
export async function marcarCorteRevisado(
  tipo: BusinessType,
  corteId: string,
  nota: string,
  revisar = true
): Promise<{ revisadoAt: string | null; revisadoNota: string | null }> {
  const revisadoAt = revisar ? new Date().toISOString() : null;
  const revisadoNota = revisar ? nota.trim() || null : null;
  const { error } = await supabase
    .from(TABLA_CORTES[tipo])
    .update({ revisado_at: revisadoAt, revisado_nota: revisadoNota })
    .eq("id", corteId);
  if (error) throw error;
  return { revisadoAt, revisadoNota };
}
