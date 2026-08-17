import Link from "next/link";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActionCardAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "ledger";
}

export function ActionCard({
  level = "yellow",
  title,
  subtitle,
  actions,
  onDismiss,
}: {
  level?: "red" | "yellow" | "green";
  title: string;
  subtitle?: string;
  actions: ActionCardAction[];
  /** Botón "X" arriba a la derecha para ocultar este aviso solo por hoy (ver lib/dismissed-alerts.ts) — sin esto, la card no se puede ignorar. Vuelve a aparecer mañana si el pendiente sigue ahí. */
  onDismiss?: () => void;
}) {
  const dot = level === "red" ? "bg-destructive" : level === "yellow" ? "bg-primary" : "bg-ledger";

  return (
    <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Ocultar por hoy"
          title="Ocultar por hoy"
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot)} />
      <div className={cn("min-w-0 flex-1", onDismiss && "pr-5")}>
        <p className="text-sm font-medium leading-snug">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 gap-1.5">
        {actions.map((a) =>
          a.href ? (
            <Button key={a.label} asChild size="sm" variant={a.variant ?? "outline"}>
              <Link href={a.href} target={a.href.startsWith("http") ? "_blank" : undefined}>
                {a.label}
              </Link>
            </Button>
          ) : (
            <Button key={a.label} size="sm" variant={a.variant ?? "outline"} onClick={a.onClick}>
              {a.label}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
