// ============================================================================
// Catálogos fijos de la app personal: categorías de dinero, de hábitos y las
// 7 categorías de los objetivos del año. Viven en código porque son un
// vocabulario, no datos: si fueran tablas habría que darlas de alta a mano
// antes de poder registrar el primer gasto.
// ============================================================================

export interface Categoria {
  clave: string;
  etiqueta: string;
  emoji: string;
  /** Color de la rebanada en las gráficas. */
  color: string;
}

export const CATEGORIAS_GASTO: Categoria[] = [
  { clave: "comida", etiqueta: "Comida", emoji: "🍽️", color: "hsl(28 88% 58%)" },
  { clave: "transporte", etiqueta: "Transporte", emoji: "🚌", color: "hsl(205 78% 56%)" },
  { clave: "escuela", etiqueta: "Escuela", emoji: "🎓", color: "hsl(268 62% 62%)" },
  { clave: "gym", etiqueta: "Gym", emoji: "🏋️", color: "hsl(158 55% 45%)" },
  { clave: "salud", etiqueta: "Salud", emoji: "💊", color: "hsl(340 70% 60%)" },
  { clave: "ocio", etiqueta: "Ocio", emoji: "🎬", color: "hsl(48 92% 55%)" },
  { clave: "casa", etiqueta: "Casa", emoji: "🏠", color: "hsl(15 70% 55%)" },
  { clave: "ropa", etiqueta: "Ropa", emoji: "👕", color: "hsl(190 62% 48%)" },
  { clave: "otro", etiqueta: "Otro", emoji: "•", color: "hsl(30 8% 55%)" },
];

export const CATEGORIAS_INGRESO: Categoria[] = [
  { clave: "sueldo", etiqueta: "Sueldo", emoji: "💼", color: "hsl(158 55% 45%)" },
  { clave: "venta", etiqueta: "Venta", emoji: "🧾", color: "hsl(38 92% 56%)" },
  { clave: "regalo", etiqueta: "Regalo", emoji: "🎁", color: "hsl(268 62% 62%)" },
  { clave: "otro", etiqueta: "Otro", emoji: "•", color: "hsl(30 8% 55%)" },
];

const TODAS = new Map([...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO].map((c) => [c.clave, c]));

export function categoriaPorClave(clave: string): Categoria {
  return TODAS.get(clave) ?? { clave, etiqueta: clave, emoji: "•", color: "hsl(30 8% 55%)" };
}

/** Categorías sugeridas al crear un hábito. */
export const CATEGORIAS_HABITO = [
  { clave: "bienestar", etiqueta: "Bienestar", emoji: "🌿" },
  { clave: "cuerpo", etiqueta: "Cuerpo", emoji: "💪" },
  { clave: "mente", etiqueta: "Mente", emoji: "🧠" },
  { clave: "productividad", etiqueta: "Productividad", emoji: "⚡" },
  { clave: "escuela", etiqueta: "Escuela", emoji: "📚" },
  { clave: "dinero", etiqueta: "Dinero", emoji: "💰" },
];

/** Las 7 "estrella polar" del planner anual. El orden es el de la pantalla. */
export const CATEGORIAS_OBJETIVO = [
  { clave: "cuerpo", etiqueta: "Cuerpo", emoji: "💪", pregunta: "¿Cómo quieres sentirte físicamente al terminar el año?" },
  { clave: "mente", etiqueta: "Mente", emoji: "🧠", pregunta: "¿Qué quieres aprender o dejar de cargar?" },
  { clave: "dinero", etiqueta: "Dinero", emoji: "💰", pregunta: "¿Qué número quieres ver, y para qué?" },
  { clave: "oficio", etiqueta: "Oficio", emoji: "🛠️", pregunta: "¿En qué quieres ser notablemente mejor?" },
  { clave: "hogar", etiqueta: "Hogar", emoji: "🏠", pregunta: "¿Cómo quieres que se sienta tu espacio?" },
  { clave: "gente", etiqueta: "Gente", emoji: "🤝", pregunta: "¿A quién quieres más cerca?" },
  { clave: "alegria", etiqueta: "Alegría", emoji: "✨", pregunta: "¿Qué te da gusto y casi nunca te das?" },
] as const;

/** Formato de dinero en pesos, sin centavos cuando son redondos. */
export function pesos(monto: number): string {
  const redondo = Math.abs(monto % 1) < 0.005;
  return monto.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: redondo ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
