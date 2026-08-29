"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, LayoutGrid, MoreHorizontal, Sun, Target, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { BotonTema } from "./tema";

/**
 * Marco de la app personal: barra superior + navegación.
 *
 * No usa nada de components/app-shell (TopBar, BottomNav, Fab): esos están
 * atados a `session.business` — un negocio con giro, plan y empleados. Aquí no
 * hay negocio, hay una persona. Compartir ese shell obligaría a inventarle un
 * negocio falso a esta app y a meterle ramas "si es la app personal" al shell
 * de FueraLibreta, que es exactamente lo que se pidió no hacer.
 */

interface Seccion {
  href: string;
  etiqueta: string;
  Icono: typeof Sun;
}

const SECCIONES: Seccion[] = [
  { href: "/app/mi-dia", etiqueta: "Hoy", Icono: Sun },
  { href: "/app/mi-dia/habitos", etiqueta: "Hábitos", Icono: Target },
  { href: "/app/mi-dia/gym", etiqueta: "Gym", Icono: Dumbbell },
  { href: "/app/mi-dia/dinero", etiqueta: "Dinero", Icono: Wallet },
  { href: "/app/mi-dia/mas", etiqueta: "Más", Icono: MoreHorizontal },
];

/** Las pantallas que cuelgan de "Más" también deben iluminar ese tab. */
const BAJO_MAS = new Set([
  "/app/mi-dia/mas",
  "/app/mi-dia/calendario",
  "/app/mi-dia/animo",
  "/app/mi-dia/logros",
  "/app/mi-dia/objetivos",
  "/app/mi-dia/notas",
]);

function esActiva(href: string, pathname: string): boolean {
  if (href === "/app/mi-dia") return pathname === "/app/mi-dia";
  if (href === "/app/mi-dia/mas") return BAJO_MAS.has(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ShellMiDia({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/app/mi-dia";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mid-barra-superior sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Link
            href="/app/admin-hub"
            title="Volver a Mis apps"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LayoutGrid className="h-[18px] w-[18px]" />
            <span className="sr-only">Mis apps</span>
          </Link>

          <Link href="/app/mi-dia" className="mid-titulo text-[19px] leading-none">
            Mi Día
          </Link>

          {/* Navegación de escritorio. En móvil vive abajo, al alcance del pulgar. */}
          <nav className="ml-auto hidden items-center gap-0.5 md:flex">
            {SECCIONES.map(({ href, etiqueta, Icono }) => {
              const activa = esActiva(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                    activa ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icono className="h-4 w-4" />
                  {etiqueta}
                </Link>
              );
            })}
          </nav>

          <BotonTema className="ml-auto md:ml-1" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-5 md:pb-16">{children}</main>

      {/* Navegación móvil: 5 destinos, pulgar abajo, safe-area respetada. */}
      <nav className="mid-barra-superior fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto flex max-w-3xl">
          {SECCIONES.map(({ href, etiqueta, Icono }) => {
            const activa = esActiva(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                  activa ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icono className={cn("h-[22px] w-[22px] transition-transform", activa && "scale-110")} />
                {etiqueta}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Encabezado estándar de las pantallas que no son "Hoy". */
export function EncabezadoPantalla({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="mid-titulo text-[28px]">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {accion && <div className="shrink-0 pb-1">{accion}</div>}
    </div>
  );
}
