"use client";

import { cn } from "@/lib/utils";

interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "danger";
  /** Chip no accionable (ej. horario ocupado/en comida) — se ve gris y no responde a click, sin importar `selected`. */
  disabled?: boolean;
}

/** Botón tipo chip para elegir opciones sin escribir. */
export function Chip({ selected, onClick, children, className, tone = "default", disabled }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-secondary/60 text-muted-foreground/70"
          : selected
            ? tone === "danger"
              ? "border-destructive bg-destructive/15 text-destructive"
              : "border-primary bg-primary/15 text-primary"
            : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

export function ChipGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}
