"use client";

import { useTemaMiDia } from "./tema";

/**
 * Colores de las gráficas.
 *
 * Se resuelven a valores hsl() LITERALES en vez de pasarle `hsl(var(--token))`
 * a recharts: recharts pinta el trazo como atributo de presentación del SVG
 * (<path stroke="…">), y el soporte de var() ahí es desparejo entre
 * navegadores — donde falla, la línea se pinta negra y la gráfica "se rompe"
 * sin ningún error en consola. Leer el tema del contexto y devolver el color
 * ya resuelto es aburrido y funciona en todos lados.
 */
export function useColoresGrafica() {
  const { tema } = useTemaMiDia();
  const oscuro = tema === "oscuro";
  return {
    // Serie principal: el ámbar de la marca, aclarado en modo papel para que
    // no se pierda contra el crema.
    primario: oscuro ? "hsl(38 92% 58%)" : "hsl(30 82% 46%)",
    verde: oscuro ? "hsl(158 58% 48%)" : "hsl(158 48% 34%)",
    azul: oscuro ? "hsl(205 80% 60%)" : "hsl(205 72% 44%)",
    rojo: oscuro ? "hsl(6 74% 60%)" : "hsl(4 66% 48%)",
    morado: oscuro ? "hsl(270 62% 66%)" : "hsl(270 52% 50%)",
    // Gris neutro: se ve igual de bien sobre casi-negro que sobre crema.
    reja: oscuro ? "hsl(0 0% 100% / 0.10)" : "hsl(0 0% 0% / 0.09)",
    eje: oscuro ? "hsl(34 10% 62%)" : "hsl(28 10% 42%)",
    tooltip: {
      // contentStyle sí es un style de un <div> real, ahí var() resuelve bien.
      background: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 12,
      fontSize: 12,
      color: "hsl(var(--foreground))",
      boxShadow: "0 8px 24px hsl(var(--mid-sombra) / var(--mid-sombra-alfa))",
    } as const,
  };
}
