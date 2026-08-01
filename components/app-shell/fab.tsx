"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FabAction {
  key: string;
  label: string;
  icon: React.ReactNode;
}

/** Botón flotante (+) con acciones rápidas tipo "speed dial" del módulo actual. */
export function Fab({ actions, onSelect }: { actions: FabAction[]; onSelect: (key: string) => void }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 animate-in fade-in bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-50 flex flex-col items-end gap-3">
        {open &&
          actions.map((action, i) => (
            <button
              key={action.key}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(action.key);
              }}
              style={{ animationDelay: `${i * 30}ms` }}
              className="flex animate-in slide-in-from-bottom-2 fade-in items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-4 pr-1.5 shadow-lg"
            >
              <span className="text-sm font-medium">{action.label}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {action.icon}
              </span>
            </button>
          ))}
        <button
          type="button"
          aria-label="Acciones rápidas"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_-4px_hsl(var(--primary)/0.6)] transition-transform duration-200",
            open && "rotate-45"
          )}
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>
    </>
  );
}
