"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, LogOut, X } from "lucide-react";

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { clearDemoPreview } from "@/lib/demoPreview";
import { universalSearch } from "@/lib/search";
import type { TenantData } from "@/lib/types";

export function TopBar({ data }: { data: TenantData }) {
  const [searching, setSearching] = React.useState(false);
  const [q, setQ] = React.useState("");
  const router = useRouter();
  const results = React.useMemo(() => universalSearch(data, q), [data, q]);

  function closeSearch() {
    setSearching(false);
    setQ("");
  }

  async function logout() {
    clearDemoPreview();
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4">
        {searching ? (
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente, pedido, producto..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="button" onClick={closeSearch} aria-label="Cerrar búsqueda">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col leading-tight">
              <span className="truncate font-display text-sm font-semibold">{data.business.nombre}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {data.business.demo ? "Modo demo" : data.business.dueno}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Buscar"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {searching && q.trim() && (
        <div className="max-h-[60vh] overflow-y-auto border-t border-border/60 bg-background px-4 py-2">
          {results.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin resultados para “{q}”.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {results.map((r, i) => (
                <Link
                  key={`${r.href}-${i}`}
                  href={r.href}
                  onClick={closeSearch}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.sublabel}</p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-primary">{r.group}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
