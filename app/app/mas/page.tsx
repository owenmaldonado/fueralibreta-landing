"use client";

import * as React from "react";
import Link from "next/link";
import { Boxes, Settings, ChevronRight, ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ADMIN_EMAIL } from "@/lib/admin-data";

const LINKS = [
  { href: "/app/productos", label: "Productos", desc: "Inventario de insumos", icon: Boxes },
  { href: "/app/configuracion", label: "Configuración", desc: "Horarios, excepciones y servicios", icon: Settings },
];

export default function MasPage() {
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => {
      setIsAdmin(data.user?.email === ADMIN_EMAIL);
    });
  }, []);

  return (
    <>
      <PageHeader title="Más" />
      <div className="flex flex-col gap-2 px-4 pb-6">
        {isAdmin && (
          <Link
            href="/admin"
            className="mb-2 block overflow-hidden rounded-2xl border-2 border-purple-500/50 bg-gradient-to-br from-purple-950 via-purple-900 to-black p-6 shadow-[0_0_45px_-10px_rgba(168,85,247,0.6)] transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-purple-500/20 text-3xl">
                👑
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-bold leading-tight text-white">👑 Panel de Dios</p>
                <p className="mt-1 text-sm text-purple-200">Eres admin · Gestionar usuarios y negocios</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-purple-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-purple-400">
              Entrar a /admin
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        )}

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
