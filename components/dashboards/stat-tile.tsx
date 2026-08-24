import { cn } from "@/lib/utils";

export function StatTile({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold tracking-tight", valueClassName)}>{value}</p>
    </div>
  );
}
