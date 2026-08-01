"use client";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/lib/session";
import { formatMoney } from "@/lib/mock";

export default function MenuPage() {
  const { session, ready, update } = useSession();
  if (!ready || !session) return <LoadingBlock />;

  const data = session.fonda!;
  const categorias = Array.from(new Set(data.platillos.map((p) => p.categoria)));

  function toggle(id: string) {
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, platillos: f.platillos.map((p) => (p.id === id ? { ...p, activoHoy: !p.activoHoy } : p)) } };
    });
  }

  return (
    <>
      <PageHeader title="Menú" subtitle="Marca lo que hay disponible hoy" />
      <div className="flex flex-col gap-5 px-4 pb-6">
        {categorias.map((cat) => (
          <div key={cat}>
            <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">{cat}</p>
            <div className="flex flex-col gap-2">
              {data.platillos
                .filter((p) => p.categoria === cat)
                .map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <Checkbox checked={p.activoHoy} onCheckedChange={() => toggle(p.id)} />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${!p.activoHoy && "text-muted-foreground line-through"}`}>{p.nombre}</p>
                    </div>
                    <span className="font-mono text-sm text-muted-foreground">{formatMoney(p.precio)}</span>
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
