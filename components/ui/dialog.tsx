"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

/** Modal centrado (escritorio-first) para el panel de admin, distinto del Sheet mobile-first. */
export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-in fade-in bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div
        className={cn(
          "relative z-10 max-h-[85vh] w-full max-w-lg animate-in fade-in zoom-in-95 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl duration-150",
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({
  title,
  description,
  onClose,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;
}
