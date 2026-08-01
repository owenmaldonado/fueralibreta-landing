import { PartyPopper } from "lucide-react";

export function EmptyState({ texto = "Todo tranquilo por ahora 🎉" }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-10 text-center">
      <PartyPopper className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}
