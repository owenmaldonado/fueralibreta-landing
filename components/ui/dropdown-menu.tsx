"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DropdownItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}

const PANEL_WIDTH = 192; // w-48

interface Posicion {
  top: number;
  left: number;
}

/**
 * Menú de ⋮ para acciones secundarias de una tarjeta o fila. AdminActionsMenu
 * puede traer hasta 10 items — dentro de una tabla con scroll horizontal
 * propio (Table ya se envuelve en su propio overflow-x-auto), un panel
 * `position: absolute` anclado al trigger queda atrapado por ese wrapper:
 * en CSS, ponerle overflow-x:auto a un contenedor fuerza su overflow-y a
 * computar como auto también (no puede quedar "visible" en un solo eje), así
 * que el menú se recortaba verticalmente sin importar qué tan alto o bajo
 * abriera. La solución real es sacarlo de ese árbol: se porta a
 * document.body con position:fixed y coordenadas medidas del trigger, con
 * z-[99999] — ningún ancestro con overflow puede volver a recortarlo.
 */
export function DropdownMenu({ items, className }: { items: DropdownItem[]; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<Posicion | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  function cerrar() {
    setOpen(false);
    setPos(null);
  }

  function calcularPosicion(): Posicion {
    const rect = triggerRef.current!.getBoundingClientRect();
    // Estimado (el panel todavía no existe en el DOM al decidir esto): cada
    // fila mide ~40px (py-2.5 + texto) + el padding vertical del contenedor.
    const alturaEstimada = items.length * 40 + 16;
    const espacioAbajo = window.innerHeight - rect.bottom;
    const abrirArriba = espacioAbajo < alturaEstimada && rect.top > alturaEstimada;
    const top = abrirArriba ? Math.max(8, rect.top - alturaEstimada - 4) : rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
    return { top, left };
  }

  function toggle() {
    if (open) {
      cerrar();
      return;
    }
    setPos(calcularPosicion());
    setOpen(true);
  }

  React.useEffect(() => {
    if (!open) return;

    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      cerrar();
    }
    // Un scroll (de la tabla, o de la página) o un resize invalida las
    // coordenadas ya medidas — más simple y predecible cerrar el menú que
    // tratar de perseguir al trigger con el panel portado.
    function onScrollOrResize() {
      cerrar();
    }

    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Más acciones"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
            className="fixed z-[99999] max-h-[min(70vh,20rem)] animate-in fade-in zoom-in-95 overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-card py-1 shadow-2xl"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onClick();
                  cerrar();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-secondary",
                  item.danger ? "text-destructive" : "text-foreground"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
