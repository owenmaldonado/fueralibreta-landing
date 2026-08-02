"use client";

import * as React from "react";
import Link from "next/link";
import { Boxes, Settings, ChevronRight, Crown } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const LINKS = [
  { href: "/app/productos", label: "Productos", desc: "Inventario de insumos", icon: Boxes },
  { href: "/app/configuracion", label: "Configuración", desc: "Horarios, excepciones y servicios", icon: Settings },
];

export default function MasPage() {
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profile }) => setIsAdmin(profile?.role === "admin"));
    });
  }, []);

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

        {isAdmin && (
          <Link href="/admin" className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Crown className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary">👑 Admin</p>
              <p className="text-xs text-muted-foreground">Panel de administración</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary" />
          </Link>
        )}
      </div>
    </>
  );
}
