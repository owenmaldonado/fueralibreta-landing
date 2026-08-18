"use client";

import { cn } from "@/lib/utils";
import type { BusinessType } from "@/lib/types";
import { TIPO_LABEL } from "./planes-cards";

const ORDEN: BusinessType[] = ["abarrotes", "barberia", "fonda"];

/** Selector de giro para /planes cuando nadie tiene sesión iniciada (así se ven los 3 precios distintos sin 3 páginas). Con sesión no se usa: el giro ya lo da el negocio del usuario. */
export function GiroTabs({ value, onChange }: { value: BusinessType; onChange: (tipo: BusinessType) => void }) {
  return (
    <div className="mx-auto flex w-fit gap-1 rounded-full border border-border bg-card p-1">
      {ORDEN.map((tipo) => (
        <button
          key={tipo}
          type="button"
          onClick={() => onChange(tipo)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            value === tipo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {TIPO_LABEL[tipo]}
        </button>
      ))}
    </div>
  );
}
