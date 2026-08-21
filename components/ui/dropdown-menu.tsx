"use client";

import * as React from "react";
import { MoreVertical } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DropdownItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}

/**
 * Menú de ⋮ para acciones secundarias de una tarjeta o fila. AdminActionsMenu
 * (components/admin/admin-actions-menu.tsx) puede traer hasta 8 items — en
 * una fila cerca del fondo de una tabla larga (Negocios/Usuarios en /admin),
 * abrir siempre hacia abajo con "position: absolute" sin tope de alto se
 * salía de la pantalla y quedaba inalcanzable (nada de scroll, nada de
 * voltearse hacia arriba). Ahora mide el espacio real debajo del botón al
 * abrir: si no alcanza para el menú completo, lo abre hacia arriba en vez
 * de hacia abajo, y de todos modos limita su alto con scroll propio como
 * red de seguridad para pantallas muy chicas.
 */
export function DropdownMenu({ items, className }: { items: DropdownItem[]; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [abrirArriba, setAbrirArriba] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function toggle() {
    if (!open && triggerRef.current) {
      // Estimado (no medido, el panel todavía no existe en el DOM al
      // decidir esto): cada fila mide ~40px (py-2.5 + texto) + el padding
      // vertical del contenedor — suficiente margen para decidir bien sin
      // esperar un segundo render.
      const alturaEstimada = items.length * 40 + 16;
      const espacioAbajo = window.innerHeight - triggerRef.current.getBoundingClientRect().bottom;
      setAbrirArriba(espacioAbajo < alturaEstimada && triggerRef.current.getBoundingClientRect().top > alturaEstimada);
    }
    setOpen((o) => !o);
  }

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Más acciones"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute right-0 z-20 max-h-[min(70vh,20rem)] w-48 animate-in fade-in zoom-in-95 overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-card py-1 shadow-lg",
            abrirArriba ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.onClick();
                setOpen(false);
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
        </div>
      )}
    </div>
  );
}
