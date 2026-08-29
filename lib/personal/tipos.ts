// ============================================================================
// Tipos de la app personal "Mi Día". Espejo 1:1 de las tablas personal_* de
// supabase/migrations/20260916000000_app_personal_mi_dia.sql.
//
// Nada de esto se cruza con lib/types.ts (FueraLibreta): son dos dominios sin
// una sola entidad compartida.
// ============================================================================

import type { ISODate } from "./fechas";

export type { ISODate };

export type Dificultad = "facil" | "media" | "dificil";
export type TipoMovimiento = "gasto" | "ingreso";
export type CategoriaObjetivo = "cuerpo" | "mente" | "dinero" | "oficio" | "hogar" | "gente" | "alegria";

/** Los 3 estados de un hábito en un día — el corazón visual del tracker. */
export type EstadoHabito = "cumplido" | "justificado" | "fallado" | "pendiente" | "no-aplica";

export interface Dia {
  id: string;
  fecha: ISODate;
  clima: string | null;
  animo: number | null;
  energia: number | null;
  horasSueno: number | null;
  vasosAgua: number;
  pesoKg: number | null;
  desayuno: string | null;
  comida: string | null;
  cena: string | null;
  snacks: string | null;
  focoDelDia: string | null;
  gratitud: string | null;
  notaDestacada: string | null;
  cerrado: boolean;
}

/** Los campos de un día que se pueden editar desde la pantalla Hoy. */
export type DiaEditable = Partial<Omit<Dia, "id" | "fecha">>;

export interface Habito {
  id: string;
  nombre: string;
  emoji: string | null;
  categoria: string | null;
  dificultad: Dificultad;
  /** 0=domingo … 6=sábado. null = aplica todos los días. */
  diasSemana: number[] | null;
  metaSemanal: number | null;
  activo: boolean;
  orden: number;
}

export interface RegistroHabito {
  id: string;
  habitoId: string;
  fecha: ISODate;
  cumplido: boolean;
  motivo: string | null;
  puntos: number;
}

export interface Evento {
  id: string;
  fecha: ISODate;
  horaInicio: string | null;
  horaFin: string | null;
  titulo: string;
  lugar: string | null;
  notas: string | null;
  color: string | null;
  hecho: boolean;
}

export interface Movimiento {
  id: string;
  fecha: ISODate;
  tipo: TipoMovimiento;
  monto: number;
  categoria: string;
  metodo: string | null;
  nota: string | null;
}

export interface Rutina {
  id: string;
  nombre: string;
  notas: string | null;
  activo: boolean;
  orden: number;
  ejercicios: RutinaEjercicio[];
}

export interface RutinaEjercicio {
  id: string;
  rutinaId: string;
  nombre: string;
  seriesObjetivo: number;
  repsObjetivo: number;
  orden: number;
}

export interface Serie {
  id: string;
  ejercicioId: string;
  numero: number;
  pesoKg: number | null;
  repeticiones: number | null;
  rpe: number | null;
}

export interface EjercicioSesion {
  id: string;
  sesionId: string;
  nombre: string;
  orden: number;
  notas: string | null;
  series: Serie[];
}

export interface Sesion {
  id: string;
  fecha: ISODate;
  nombre: string;
  rutinaId: string | null;
  duracionMin: number | null;
  sensacion: number | null;
  notas: string | null;
  ejercicios: EjercicioSesion[];
}

export interface LogroDesbloqueado {
  clave: string;
  fechaDesbloqueo: ISODate;
}

export interface Objetivo {
  id: string;
  anio: number;
  categoria: CategoriaObjetivo;
  texto: string | null;
  logrado: boolean;
}

export interface Anio {
  anio: number;
  palabra: string | null;
  intencion: string | null;
}

export interface Nota {
  id: string;
  titulo: string | null;
  cuerpo: string | null;
  fijada: boolean;
  creadoEn: string;
  actualizadoEn: string;
}
