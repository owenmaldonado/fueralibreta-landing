"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Tema de la app personal. Pone data-mid-tema en <html> mientras esta app
 * está montada y lo QUITA al salir — ver el comentario largo en mi-dia.css:
 * va en <html> y no en un div para que los modales (que se pintan con portal
 * en document.body) también agarren los colores correctos.
 *
 * La limpieza al desmontar es lo que garantiza que navegar de /app/mi-dia a
 * cualquier pantalla de FueraLibreta la deje exactamente como estaba.
 */

export type TemaMiDia = "oscuro" | "papel";

const LLAVE = "mid_tema";

// Definido a nivel de módulo, no dentro del componente: un hook elegido con un
// ternario dentro del cuerpo es exactamente lo que la regla de los hooks
// prohíbe. useLayoutEffect no existe en el render del servidor, de ahí el
// fallback.
const useEfectoDeLayout = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

const Ctx = React.createContext<{ tema: TemaMiDia; alternar: () => void }>({
  tema: "oscuro",
  alternar: () => {},
});

export function useTemaMiDia() {
  return React.useContext(Ctx);
}

export function ProveedorTema({
  children,
  claseFuente,
}: {
  children: React.ReactNode;
  /**
   * Clase que next/font genera para la serif (fraunces.variable). Se copia a
   * <html> por la misma razón que el tema: los modales se pintan con portal en
   * document.body y quedarían fuera de cualquier contenedor, sin la fuente.
   */
  claseFuente?: string;
}) {
  const [tema, setTema] = React.useState<TemaMiDia>("oscuro");

  // El atributo queda puesto antes del primer pintado del contenido, no un
  // frame después: eso es lo que evita el parpadeo al entrar en modo papel.
  useEfectoDeLayout(() => {
    let guardado: TemaMiDia = "oscuro";
    try {
      const raw = window.localStorage.getItem(LLAVE);
      if (raw === "papel" || raw === "oscuro") guardado = raw;
    } catch {
      // Safari en privado tira al leer localStorage; el default basta.
    }
    setTema(guardado);
    document.documentElement.dataset.midTema = guardado;
    if (claseFuente) document.documentElement.classList.add(claseFuente);
    return () => {
      delete document.documentElement.dataset.midTema;
      if (claseFuente) document.documentElement.classList.remove(claseFuente);
    };
  }, [claseFuente]);

  const alternar = React.useCallback(() => {
    setTema((actual) => {
      const siguiente: TemaMiDia = actual === "oscuro" ? "papel" : "oscuro";
      document.documentElement.dataset.midTema = siguiente;
      try {
        window.localStorage.setItem(LLAVE, siguiente);
      } catch {
        // Sin persistencia: el tema dura lo que dure la sesión. No es un error.
      }
      return siguiente;
    });
  }, []);

  const valor = React.useMemo(() => ({ tema, alternar }), [tema, alternar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function BotonTema({ className }: { className?: string }) {
  const { tema, alternar } = useTemaMiDia();
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={tema === "oscuro" ? "Cambiar a modo papel" : "Cambiar a modo noche"}
      title={tema === "oscuro" ? "Modo papel" : "Modo noche"}
      className={
        "flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground " +
        (className ?? "")
      }
    >
      {tema === "oscuro" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

/**
 * Se inyecta en el layout para que el atributo exista ANTES de que el
 * navegador pinte nada. Sin esto, entrar en modo papel muestra un flashazo
 * oscuro mientras hidrata React.
 */
export const SCRIPT_TEMA_INICIAL = `(function(){try{var t=localStorage.getItem("${LLAVE}");document.documentElement.dataset.midTema=(t==="papel"||t==="oscuro")?t:"oscuro";}catch(e){document.documentElement.dataset.midTema="oscuro";}})();`;
