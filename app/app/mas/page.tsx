import Link from "next/link";
import { Boxes, Settings, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";

const LINKS = [
  { href: "/app/productos", label: "Productos", desc: "Inventario de insumos", icon: Boxes },
  { href: "/app/configuracion", label: "Configuración", desc: "Horarios, excepciones y servicios", icon: Settings },
];

export default function MasPage() {
  return (
    <>
      <PageHeader title="Más" />
      <div className="flex flex-col gap-2 px-4 pb-6">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <l.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{l.label}</p>
              <p className="text-xs text-muted-foreground">{l.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </>
  );
}
