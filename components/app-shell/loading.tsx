import { Loader2 } from "lucide-react";

export function LoadingBlock() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
