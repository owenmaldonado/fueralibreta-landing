"use client";

import { useParams } from "next/navigation";

// Lienzo en blanco genérico: destino de "Entrar" para cualquier app del hub
// (/app/admin-hub) que todavía no tiene un módulo real construido. Next.js
// le da prioridad a las rutas estáticas sobre esta dinámica en el mismo
// nivel, así que /app/rentas, /app/inicio, etc. siguen abriendo su propia
// página real — esto solo atrapa slugs sin página propia todavía.
//
// useParams() en vez de window.location (como se pidió originalmente):
// este componente se renderiza primero en el servidor, donde `window` no
// existe — leerlo directo en el cuerpo del render tronaría ahí.
export default function BlankApp() {
  const params = useParams<{ slug: string }>();
  return (
    <div className="min-h-screen bg-black text-white p-10">
      <h1 className="text-2xl opacity-20">App lista: /app/{params.slug}</h1>
      <p className="mt-10 text-5xl">Lienzo en blanco esperando instrucciones de Claude...</p>
    </div>
  );
}
