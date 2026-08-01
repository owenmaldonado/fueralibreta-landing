import Image from "next/image";

import { cn } from "@/lib/utils";

export function Avatar({ src, label, className }: { src?: string | null; label: string; className?: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || "?";

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={32}
        height={32}
        unoptimized
        referrerPolicy="no-referrer"
        className={cn("h-8 w-8 shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-xs font-semibold text-primary",
        className
      )}
    >
      {initial}
    </div>
  );
}
