// ============================================================================
// Toda la conversación con Supabase de la app personal. Ninguna pantalla llama
// a supabase.from() directo: si un día esto se muda a su propio proyecto,
// se cambia este archivo y nada más.
//
// Seguridad: no se manda owner_id en ningún insert — la columna tiene
// `default auth.uid()` y la policy tiene `with check (owner_id = auth.uid())`.
// Es decir, el dueño lo pone la base, no el cliente; el navegador no tiene
// forma de escribir una fila a nombre de otro usuario aunque quisiera.
// ============================================================================

import { supabase } from "@/lib/supabase";
import type {
  Anio, CategoriaObjetivo, Dia, DiaEditable, EjercicioSesion, Evento, FuenteHabito, Habito,
  ISODate, LogroDesbloqueado, Movimiento, Nota, Objetivo, RegistroHabito,
  Rutina, RutinaEjercicio, Serie, Sesion, TipoMovimiento, VisualHabito,
} from "./tipos";
import { puntosDe } from "./reglas";

type Row = Record<string, any>;

/** Los errores de PostgREST son objetos planos, no Error — hay que desenvolverlos a mano. */
function lanzar(error: unknown, contexto: string): never {
  const mensaje =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message)
      : "Error desconocido";
  throw new Error(`${contexto}: ${mensaje}`);
}

function ok<T>(res: { data: T | null; error: unknown }, contexto: string): T {
  if (res.error) lanzar(res.error, contexto);
  return (res.data ?? []) as T;
}

// ============================================================================
// EL DÍA
// ============================================================================

function aDia(r: Row): Dia {
  return {
    id: r.id,
    fecha: r.fecha,
    clima: r.clima,
    animo: r.animo,
    energia: r.energia,
    horasSueno: r.horas_sueno == null ? null : Number(r.horas_sueno),
    vasosAgua: r.vasos_agua ?? 0,
    pesoKg: r.peso_kg == null ? null : Number(r.peso_kg),
    desayuno: r.desayuno,
    comida: r.comida,
    cena: r.cena,
    snacks: r.snacks,
    focoDelDia: r.foco_del_dia,
    gratitud: r.gratitud,
    notaDestacada: r.nota_destacada,
    cerrado: Boolean(r.cerrado),
  };
}

const CAMPOS_DIA: Record<keyof DiaEditable, string> = {
  clima: "clima",
  animo: "animo",
  energia: "energia",
  horasSueno: "horas_sueno",
  vasosAgua: "vasos_agua",
  pesoKg: "peso_kg",
  desayuno: "desayuno",
  comida: "comida",
  cena: "cena",
  snacks: "snacks",
  focoDelDia: "foco_del_dia",
  gratitud: "gratitud",
  notaDestacada: "nota_destacada",
  cerrado: "cerrado",
};

export async function obtenerDias(desde: ISODate, hasta: ISODate): Promise<Dia[]> {
  const res = await supabase
    .from("personal_dias")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });
  return ok<Row[]>(res, "No se pudieron leer los días").map(aDia);
}

export async function obtenerDia(fecha: ISODate): Promise<Dia | null> {
  const res = await supabase.from("personal_dias").select("*").eq("fecha", fecha).maybeSingle();
  if (res.error) lanzar(res.error, "No se pudo leer el día");
  return res.data ? aDia(res.data) : null;
}

/**
 * Guarda cambios parciales del día. Es un upsert por (owner_id, fecha): la
 * primera vez que tocas cualquier cosa del día, la fila nace sola. Nunca hay
 * que "crear el día" antes de escribir en él.
 */
export async function guardarDia(fecha: ISODate, cambios: DiaEditable): Promise<Dia> {
  const payload: Row = { fecha };
  for (const [clave, valor] of Object.entries(cambios)) {
    const columna = CAMPOS_DIA[clave as keyof DiaEditable];
    if (columna) payload[columna] = valor;
  }
  const res = await supabase
    .from("personal_dias")
    .upsert(payload, { onConflict: "owner_id,fecha" })
    .select()
    .single();
  if (res.error) lanzar(res.error, "No se pudo guardar el día");
  return aDia(res.data);
}

// ============================================================================
// HÁBITOS
// ============================================================================

function aHabito(r: Row): Habito {
  return {
    id: r.id,
    nombre: r.nombre,
    emoji: r.emoji,
    categoria: r.categoria,
    dificultad: r.dificultad,
    diasSemana: r.dias_semana ?? null,
    metaSemanal: r.meta_semanal,
    activo: Boolean(r.activo),
    orden: r.orden ?? 0,
    visual: (r.visual ?? "anillo") as VisualHabito,
    metaValor: r.meta_valor == null ? null : Number(r.meta_valor),
    unidad: r.unidad,
    fuente: (r.fuente ?? "manual") as FuenteHabito,
  };
}

export async function obtenerHabitos(incluirArchivados = false): Promise<Habito[]> {
  let q = supabase.from("personal_habitos").select("*").order("orden").order("creado_en");
  if (!incluirArchivados) q = q.eq("activo", true);
  return ok<Row[]>(await q, "No se pudieron leer los hábitos").map(aHabito);
}

export type HabitoNuevo = Omit<Habito, "id" | "activo"> & { activo?: boolean };

export async function crearHabito(h: HabitoNuevo): Promise<Habito> {
  const res = await supabase
    .from("personal_habitos")
    .insert({
      nombre: h.nombre,
      emoji: h.emoji,
      categoria: h.categoria,
      dificultad: h.dificultad,
      dias_semana: h.diasSemana,
      meta_semanal: h.metaSemanal,
      orden: h.orden,
      activo: h.activo ?? true,
      visual: h.visual,
      meta_valor: h.metaValor,
      unidad: h.unidad,
      fuente: h.fuente,
    })
    .select()
    .single();
  if (res.error) lanzar(res.error, "No se pudo crear el hábito");
  return aHabito(res.data);
}

export async function actualizarHabito(id: string, cambios: Partial<HabitoNuevo>): Promise<void> {
  const payload: Row = {};
  if (cambios.nombre !== undefined) payload.nombre = cambios.nombre;
  if (cambios.emoji !== undefined) payload.emoji = cambios.emoji;
  if (cambios.categoria !== undefined) payload.categoria = cambios.categoria;
  if (cambios.dificultad !== undefined) payload.dificultad = cambios.dificultad;
  if (cambios.diasSemana !== undefined) payload.dias_semana = cambios.diasSemana;
  if (cambios.metaSemanal !== undefined) payload.meta_semanal = cambios.metaSemanal;
  if (cambios.orden !== undefined) payload.orden = cambios.orden;
  if (cambios.activo !== undefined) payload.activo = cambios.activo;
  if (cambios.visual !== undefined) payload.visual = cambios.visual;
  if (cambios.metaValor !== undefined) payload.meta_valor = cambios.metaValor;
  if (cambios.unidad !== undefined) payload.unidad = cambios.unidad;
  if (cambios.fuente !== undefined) payload.fuente = cambios.fuente;
  const res = await supabase.from("personal_habitos").update(payload).eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo actualizar el hábito");
}

/**
 * Archivar, no borrar: `activo=false` saca el hábito de la pantalla Hoy pero
 * conserva su historial. Borrarlo de verdad haría cascade sobre
 * personal_habito_registro y te dejaría un hueco en el tracker de meses
 * pasados — la app perdería memoria de algo que sí hiciste.
 */
export async function archivarHabito(id: string): Promise<void> {
  await actualizarHabito(id, { activo: false });
}

/** Borrado real, con todo su historial. Solo desde "Gestionar hábitos", con confirmación. */
export async function borrarHabito(id: string): Promise<void> {
  const res = await supabase.from("personal_habitos").delete().eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo borrar el hábito");
}

// --- Registros ------------------------------------------------------------

function aRegistro(r: Row): RegistroHabito {
  return {
    id: r.id,
    habitoId: r.habito_id,
    fecha: r.fecha,
    cumplido: Boolean(r.cumplido),
    motivo: r.motivo,
    puntos: r.puntos ?? 0,
    avance: r.avance == null ? null : Number(r.avance),
  };
}

export async function obtenerRegistros(desde: ISODate, hasta: ISODate): Promise<RegistroHabito[]> {
  const res = await supabase
    .from("personal_habito_registro")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  return ok<Row[]>(res, "No se pudieron leer los hábitos del periodo").map(aRegistro);
}

/**
 * Marca un hábito en un día. Un solo punto de entrada para los tres estados:
 *   cumplido=true                → verde, puntos completos
 *   cumplido=false + motivo      → naranja, 0 puntos, NO rompe racha
 *   cumplido=false sin motivo    → rojo, 0 puntos, rompe racha
 */
export async function marcarHabito(
  habito: Pick<Habito, "id" | "dificultad">,
  fecha: ISODate,
  cumplido: boolean,
  motivo?: string | null,
  avance?: number | null
): Promise<RegistroHabito> {
  const res = await supabase
    .from("personal_habito_registro")
    .upsert(
      {
        habito_id: habito.id,
        fecha,
        cumplido,
        motivo: cumplido ? null : (motivo?.trim() || null),
        puntos: cumplido ? puntosDe(habito.dificultad) : 0,
        avance: avance ?? null,
      },
      { onConflict: "owner_id,habito_id,fecha" }
    )
    .select()
    .single();
  if (res.error) lanzar(res.error, "No se pudo guardar el hábito");
  return aRegistro(res.data);
}

/** Regresa el hábito a "pendiente" (gris) — deshacer un toque mal dado. */
export async function limpiarRegistro(habitoId: string, fecha: ISODate): Promise<void> {
  const res = await supabase
    .from("personal_habito_registro")
    .delete()
    .eq("habito_id", habitoId)
    .eq("fecha", fecha);
  if (res.error) lanzar(res.error, "No se pudo deshacer el hábito");
}

// ============================================================================
// AGENDA
// ============================================================================

function aEvento(r: Row): Evento {
  return {
    id: r.id,
    fecha: r.fecha,
    horaInicio: r.hora_inicio,
    horaFin: r.hora_fin,
    titulo: r.titulo,
    lugar: r.lugar,
    notas: r.notas,
    color: r.color,
    hecho: Boolean(r.hecho),
  };
}

export async function obtenerEventos(desde: ISODate, hasta: ISODate): Promise<Evento[]> {
  const res = await supabase
    .from("personal_eventos")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("hora_inicio", { nullsFirst: false });
  return ok<Row[]>(res, "No se pudo leer la agenda").map(aEvento);
}

export type EventoNuevo = Omit<Evento, "id" | "hecho"> & { hecho?: boolean };

export async function crearEvento(e: EventoNuevo): Promise<Evento> {
  const res = await supabase
    .from("personal_eventos")
    .insert({
      fecha: e.fecha,
      hora_inicio: e.horaInicio || null,
      hora_fin: e.horaFin || null,
      titulo: e.titulo,
      lugar: e.lugar || null,
      notas: e.notas || null,
      color: e.color || null,
      hecho: e.hecho ?? false,
    })
    .select()
    .single();
  if (res.error) lanzar(res.error, "No se pudo crear el evento");
  return aEvento(res.data);
}

export async function actualizarEvento(id: string, cambios: Partial<EventoNuevo>): Promise<void> {
  const payload: Row = {};
  if (cambios.titulo !== undefined) payload.titulo = cambios.titulo;
  if (cambios.fecha !== undefined) payload.fecha = cambios.fecha;
  if (cambios.horaInicio !== undefined) payload.hora_inicio = cambios.horaInicio || null;
  if (cambios.horaFin !== undefined) payload.hora_fin = cambios.horaFin || null;
  if (cambios.lugar !== undefined) payload.lugar = cambios.lugar || null;
  if (cambios.notas !== undefined) payload.notas = cambios.notas || null;
  if (cambios.color !== undefined) payload.color = cambios.color || null;
  if (cambios.hecho !== undefined) payload.hecho = cambios.hecho;
  const res = await supabase.from("personal_eventos").update(payload).eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo actualizar el evento");
}

export async function borrarEvento(id: string): Promise<void> {
  const res = await supabase.from("personal_eventos").delete().eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo borrar el evento");
}

// ============================================================================
// DINERO
// ============================================================================

function aMovimiento(r: Row): Movimiento {
  return {
    id: r.id,
    fecha: r.fecha,
    tipo: r.tipo as TipoMovimiento,
    monto: Number(r.monto),
    categoria: r.categoria,
    metodo: r.metodo,
    nota: r.nota,
  };
}

export async function obtenerMovimientos(desde: ISODate, hasta: ISODate): Promise<Movimiento[]> {
  const res = await supabase
    .from("personal_movimientos")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  return ok<Row[]>(res, "No se pudieron leer los movimientos").map(aMovimiento);
}

export async function crearMovimiento(m: Omit<Movimiento, "id">): Promise<Movimiento> {
  const res = await supabase
    .from("personal_movimientos")
    .insert({
      fecha: m.fecha,
      tipo: m.tipo,
      monto: m.monto,
      categoria: m.categoria,
      metodo: m.metodo || null,
      nota: m.nota || null,
    })
    .select()
    .single();
  if (res.error) lanzar(res.error, "No se pudo guardar el movimiento");
  return aMovimiento(res.data);
}

export async function borrarMovimiento(id: string): Promise<void> {
  const res = await supabase.from("personal_movimientos").delete().eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo borrar el movimiento");
}

// ============================================================================
// GYM
// ============================================================================

function aRutinaEjercicio(r: Row): RutinaEjercicio {
  return {
    id: r.id,
    rutinaId: r.rutina_id,
    nombre: r.nombre,
    seriesObjetivo: r.series_objetivo ?? 3,
    repsObjetivo: r.reps_objetivo ?? 10,
    orden: r.orden ?? 0,
  };
}

export async function obtenerRutinas(): Promise<Rutina[]> {
  const [rutinasRes, ejerciciosRes] = await Promise.all([
    supabase.from("personal_gym_rutinas").select("*").eq("activo", true).order("orden"),
    supabase.from("personal_gym_rutina_ejercicios").select("*").order("orden"),
  ]);
  const rutinas = ok<Row[]>(rutinasRes, "No se pudieron leer las rutinas");
  const ejercicios = ok<Row[]>(ejerciciosRes, "No se pudieron leer los ejercicios de las rutinas").map(aRutinaEjercicio);
  return rutinas.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    notas: r.notas,
    activo: Boolean(r.activo),
    orden: r.orden ?? 0,
    ejercicios: ejercicios.filter((e) => e.rutinaId === r.id).sort((a, b) => a.orden - b.orden),
  }));
}

export async function crearRutina(
  nombre: string,
  ejercicios: { nombre: string; seriesObjetivo: number; repsObjetivo: number }[],
  orden = 0
): Promise<string> {
  const rutinaRes = await supabase.from("personal_gym_rutinas").insert({ nombre, orden }).select("id").single();
  if (rutinaRes.error) lanzar(rutinaRes.error, "No se pudo crear la rutina");
  const rutinaId = rutinaRes.data.id as string;
  if (ejercicios.length > 0) {
    const res = await supabase.from("personal_gym_rutina_ejercicios").insert(
      ejercicios.map((e, i) => ({
        rutina_id: rutinaId,
        nombre: e.nombre,
        series_objetivo: e.seriesObjetivo,
        reps_objetivo: e.repsObjetivo,
        orden: i,
      }))
    );
    if (res.error) lanzar(res.error, "No se pudieron guardar los ejercicios de la rutina");
  }
  return rutinaId;
}

/** Reemplaza por completo los ejercicios de una rutina (más simple y predecible que un diff). */
export async function guardarEjerciciosDeRutina(
  rutinaId: string,
  ejercicios: { nombre: string; seriesObjetivo: number; repsObjetivo: number }[]
): Promise<void> {
  const borrado = await supabase.from("personal_gym_rutina_ejercicios").delete().eq("rutina_id", rutinaId);
  if (borrado.error) lanzar(borrado.error, "No se pudo actualizar la rutina");
  if (ejercicios.length === 0) return;
  const res = await supabase.from("personal_gym_rutina_ejercicios").insert(
    ejercicios.map((e, i) => ({
      rutina_id: rutinaId,
      nombre: e.nombre,
      series_objetivo: e.seriesObjetivo,
      reps_objetivo: e.repsObjetivo,
      orden: i,
    }))
  );
  if (res.error) lanzar(res.error, "No se pudieron guardar los ejercicios de la rutina");
}

export async function renombrarRutina(id: string, nombre: string): Promise<void> {
  const res = await supabase.from("personal_gym_rutinas").update({ nombre }).eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo renombrar la rutina");
}

export async function borrarRutina(id: string): Promise<void> {
  // activo=false, no delete: las sesiones ya hechas apuntan aquí (rutina_id).
  const res = await supabase.from("personal_gym_rutinas").update({ activo: false }).eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo borrar la rutina");
}

// --- Sesiones -------------------------------------------------------------

function aSerie(r: Row): Serie {
  return {
    id: r.id,
    ejercicioId: r.ejercicio_id,
    numero: r.numero ?? 1,
    pesoKg: r.peso_kg == null ? null : Number(r.peso_kg),
    repeticiones: r.repeticiones,
    rpe: r.rpe,
  };
}

/**
 * Sesiones con sus ejercicios y series. Se arma con 3 consultas y se cose en
 * memoria en vez de usar el embedding de PostgREST: el embedding no deja
 * ordenar los niveles anidados de forma portable entre versiones de
 * supabase-js, y aquí el orden de las series ES el dato (serie 1, 2, 3...).
 */
export async function obtenerSesiones(desde: ISODate, hasta: ISODate): Promise<Sesion[]> {
  const sesionesRes = await supabase
    .from("personal_gym_sesiones")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });
  const sesiones = ok<Row[]>(sesionesRes, "No se pudieron leer las sesiones");
  if (sesiones.length === 0) return [];

  const sesionIds = sesiones.map((s) => s.id as string);
  const ejerciciosRes = await supabase
    .from("personal_gym_ejercicios")
    .select("*")
    .in("sesion_id", sesionIds)
    .order("orden");
  const ejercicios = ok<Row[]>(ejerciciosRes, "No se pudieron leer los ejercicios");

  let series: Row[] = [];
  if (ejercicios.length > 0) {
    const seriesRes = await supabase
      .from("personal_gym_series")
      .select("*")
      .in("ejercicio_id", ejercicios.map((e) => e.id as string))
      .order("numero");
    series = ok<Row[]>(seriesRes, "No se pudieron leer las series");
  }

  const seriesPorEjercicio = new Map<string, Serie[]>();
  for (const row of series) {
    const s = aSerie(row);
    const lista = seriesPorEjercicio.get(s.ejercicioId);
    if (lista) lista.push(s);
    else seriesPorEjercicio.set(s.ejercicioId, [s]);
  }

  const ejerciciosPorSesion = new Map<string, EjercicioSesion[]>();
  for (const row of ejercicios) {
    const e: EjercicioSesion = {
      id: row.id,
      sesionId: row.sesion_id,
      nombre: row.nombre,
      orden: row.orden ?? 0,
      notas: row.notas,
      series: (seriesPorEjercicio.get(row.id) ?? []).sort((a, b) => a.numero - b.numero),
    };
    const lista = ejerciciosPorSesion.get(e.sesionId);
    if (lista) lista.push(e);
    else ejerciciosPorSesion.set(e.sesionId, [e]);
  }

  return sesiones.map((s) => ({
    id: s.id,
    fecha: s.fecha,
    nombre: s.nombre,
    rutinaId: s.rutina_id,
    duracionMin: s.duracion_min,
    sensacion: s.sensacion,
    notas: s.notas,
    ejercicios: (ejerciciosPorSesion.get(s.id) ?? []).sort((a, b) => a.orden - b.orden),
  }));
}

export interface SesionNueva {
  fecha: ISODate;
  nombre: string;
  rutinaId?: string | null;
  ejercicios: { nombre: string; series: { numero: number; pesoKg: number | null; repeticiones: number | null }[] }[];
}

/** Crea la sesión completa (sesión + ejercicios + series) de un jalón. */
export async function crearSesion(s: SesionNueva): Promise<string> {
  const sesionRes = await supabase
    .from("personal_gym_sesiones")
    .insert({ fecha: s.fecha, nombre: s.nombre, rutina_id: s.rutinaId ?? null })
    .select("id")
    .single();
  if (sesionRes.error) lanzar(sesionRes.error, "No se pudo crear la sesión");
  const sesionId = sesionRes.data.id as string;

  if (s.ejercicios.length > 0) {
    const ejRes = await supabase
      .from("personal_gym_ejercicios")
      .insert(s.ejercicios.map((e, i) => ({ sesion_id: sesionId, nombre: e.nombre, orden: i })))
      .select("id, orden");
    if (ejRes.error) lanzar(ejRes.error, "No se pudieron crear los ejercicios");

    const porOrden = new Map<number, string>((ejRes.data ?? []).map((r: Row) => [r.orden as number, r.id as string]));
    const series = s.ejercicios.flatMap((e, i) =>
      e.series.map((serie) => ({
        ejercicio_id: porOrden.get(i)!,
        numero: serie.numero,
        peso_kg: serie.pesoKg,
        repeticiones: serie.repeticiones,
      }))
    ).filter((x) => x.ejercicio_id);

    if (series.length > 0) {
      const serRes = await supabase.from("personal_gym_series").insert(series);
      if (serRes.error) lanzar(serRes.error, "No se pudieron guardar las series");
    }
  }
  return sesionId;
}

export async function actualizarSesion(
  id: string,
  cambios: { nombre?: string; duracionMin?: number | null; sensacion?: number | null; notas?: string | null }
): Promise<void> {
  const payload: Row = {};
  if (cambios.nombre !== undefined) payload.nombre = cambios.nombre;
  if (cambios.duracionMin !== undefined) payload.duracion_min = cambios.duracionMin;
  if (cambios.sensacion !== undefined) payload.sensacion = cambios.sensacion;
  if (cambios.notas !== undefined) payload.notas = cambios.notas;
  const res = await supabase.from("personal_gym_sesiones").update(payload).eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo actualizar la sesión");
}

export async function borrarSesion(id: string): Promise<void> {
  const res = await supabase.from("personal_gym_sesiones").delete().eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo borrar la sesión");
}

export async function agregarEjercicioASesion(sesionId: string, nombre: string, orden: number): Promise<string> {
  const res = await supabase
    .from("personal_gym_ejercicios")
    .insert({ sesion_id: sesionId, nombre, orden })
    .select("id")
    .single();
  if (res.error) lanzar(res.error, "No se pudo agregar el ejercicio");
  return res.data.id as string;
}

export async function borrarEjercicio(id: string): Promise<void> {
  const res = await supabase.from("personal_gym_ejercicios").delete().eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo borrar el ejercicio");
}

export async function guardarSerie(s: {
  id?: string;
  ejercicioId: string;
  numero: number;
  pesoKg: number | null;
  repeticiones: number | null;
}): Promise<Serie> {
  const payload = {
    ejercicio_id: s.ejercicioId,
    numero: s.numero,
    peso_kg: s.pesoKg,
    repeticiones: s.repeticiones,
  };
  const res = s.id
    ? await supabase.from("personal_gym_series").update(payload).eq("id", s.id).select().single()
    : await supabase.from("personal_gym_series").insert(payload).select().single();
  if (res.error) lanzar(res.error, "No se pudo guardar la serie");
  return aSerie(res.data);
}

export async function borrarSerie(id: string): Promise<void> {
  const res = await supabase.from("personal_gym_series").delete().eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo borrar la serie");
}

// ============================================================================
// LOGROS
// ============================================================================

export async function obtenerLogros(): Promise<LogroDesbloqueado[]> {
  const res = await supabase.from("personal_logros").select("clave, fecha_desbloqueo");
  return ok<Row[]>(res, "No se pudieron leer los logros").map((r) => ({
    clave: r.clave,
    fechaDesbloqueo: r.fecha_desbloqueo,
  }));
}

export async function desbloquearLogros(claves: string[]): Promise<void> {
  if (claves.length === 0) return;
  const res = await supabase
    .from("personal_logros")
    .upsert(claves.map((clave) => ({ clave })), { onConflict: "owner_id,clave", ignoreDuplicates: true });
  if (res.error) lanzar(res.error, "No se pudieron guardar los logros");
}

/** Puntos acumulados de toda la vida. Se suma en el cliente porque a escala personal son cientos de filas, no millones. */
export async function obtenerPuntosTotales(): Promise<number> {
  const res = await supabase.from("personal_habito_registro").select("puntos");
  return ok<Row[]>(res, "No se pudieron leer los puntos").reduce((acc, r) => acc + (r.puntos ?? 0), 0);
}

// ============================================================================
// OBJETIVOS DEL AÑO
// ============================================================================

export async function obtenerObjetivos(anio: number): Promise<Objetivo[]> {
  const res = await supabase.from("personal_objetivos").select("*").eq("anio", anio);
  return ok<Row[]>(res, "No se pudieron leer los objetivos").map((r) => ({
    id: r.id,
    anio: r.anio,
    categoria: r.categoria as CategoriaObjetivo,
    texto: r.texto,
    logrado: Boolean(r.logrado),
  }));
}

export async function guardarObjetivo(
  anio: number,
  categoria: CategoriaObjetivo,
  cambios: { texto?: string | null; logrado?: boolean }
): Promise<void> {
  const payload: Row = { anio, categoria };
  if (cambios.texto !== undefined) payload.texto = cambios.texto;
  if (cambios.logrado !== undefined) payload.logrado = cambios.logrado;
  const res = await supabase.from("personal_objetivos").upsert(payload, { onConflict: "owner_id,anio,categoria" });
  if (res.error) lanzar(res.error, "No se pudo guardar el objetivo");
}

export async function obtenerAnio(anio: number): Promise<Anio | null> {
  const res = await supabase.from("personal_anio").select("*").eq("anio", anio).maybeSingle();
  if (res.error) lanzar(res.error, "No se pudo leer el año");
  return res.data ? { anio: res.data.anio, palabra: res.data.palabra, intencion: res.data.intencion } : null;
}

export async function guardarAnio(anio: number, cambios: { palabra?: string | null; intencion?: string | null }): Promise<void> {
  const payload: Row = { anio, ...cambios };
  const res = await supabase.from("personal_anio").upsert(payload, { onConflict: "owner_id,anio" });
  if (res.error) lanzar(res.error, "No se pudo guardar el año");
}

// ============================================================================
// NOTAS
// ============================================================================

function aNota(r: Row): Nota {
  return {
    id: r.id,
    titulo: r.titulo,
    cuerpo: r.cuerpo,
    fijada: Boolean(r.fijada),
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

export async function obtenerNotas(): Promise<Nota[]> {
  const res = await supabase
    .from("personal_notas")
    .select("*")
    .order("fijada", { ascending: false })
    .order("actualizado_en", { ascending: false });
  return ok<Row[]>(res, "No se pudieron leer las notas").map(aNota);
}

export async function crearNota(titulo: string, cuerpo: string): Promise<Nota> {
  const res = await supabase.from("personal_notas").insert({ titulo, cuerpo }).select().single();
  if (res.error) lanzar(res.error, "No se pudo crear la nota");
  return aNota(res.data);
}

export async function actualizarNota(
  id: string,
  cambios: { titulo?: string | null; cuerpo?: string | null; fijada?: boolean }
): Promise<void> {
  const res = await supabase.from("personal_notas").update(cambios).eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo guardar la nota");
}

export async function borrarNota(id: string): Promise<void> {
  const res = await supabase.from("personal_notas").delete().eq("id", id);
  if (res.error) lanzar(res.error, "No se pudo borrar la nota");
}
