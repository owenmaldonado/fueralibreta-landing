"use client";

import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

interface TabItem {
  value: string;
  label: string;
}

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  tabs: TabItem[];
  className?: string;
  /** Tabs que el plan actual no tiene: se ven con 🔒, opacity-50, no reciben click. */
  disabledValues?: Set<string>;
}

/** Segmented control simple para navegar secciones dentro de una pantalla. */
export function Tabs({ value, onValueChange, tabs, className, disabledValues }: TabsProps) {
  return (
    <div className={cn("flex gap-1 rounded-lg bg-secondary p-1", className)}>
      {tabs.map((tab) => {
        const disabled = disabledValues?.has(tab.value) ?? false;
        return (
          <button
            key={tab.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onValueChange(tab.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              disabled
                ? "cursor-not-allowed text-muted-foreground opacity-50"
                : value === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
            )}
          >
            {disabled && <Lock className="h-3 w-3 shrink-0" />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
