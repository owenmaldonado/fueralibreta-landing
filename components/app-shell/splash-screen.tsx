"use client";

import * as React from "react";

/**
 * Pantalla de arranque de la app instalada: se muestra mientras se valida
 * la sesión (ver authenticated-shell.tsx), justo después de que Android
 * cierra su splash nativo — por eso tiene que verse nítida desde el primer
 * frame: sin blur, sin animación de escala (que es lo que se percibía como
 * "logo borroso" en ese medio segundo), fondo sólido sin transparencia.
 */
export function SplashScreen() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <main
      className="flex min-h-screen items-center justify-center transition-opacity duration-300 ease-out"
      style={{ backgroundColor: "#0a0a0a", opacity: visible ? 1 : 0 }}
    >
      <img
        src="/icons/icon-maskable-512.png"
        alt=""
        width={120}
        height={120}
        style={{
          width: "120px",
          height: "120px",
          objectFit: "contain",
          imageRendering: "crisp-edges",
        }}
      />
    </main>
  );
}
