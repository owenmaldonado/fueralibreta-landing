"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, LogOut, X, ShieldCheck, Users } from "lucide-react";

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { clearDemoPreview } from "@/lib/demoPreview";
import { universalSearch } from "@/lib/search";
import type { TenantData, EmpleadoActual } from "@/lib/types";

export function TopBar({
  data,
  isAdmin,
  empleadoActual,
  onCambiarUsuario,
}: {
  data: TenantData;
  isAdmin?: boolean;
  /** Modo PIN activo en este dispositivo (ver AuthenticatedShell) — presente tanto si es un empleado como si es el dueño entrando por el kiosko. */
  empleadoActual?: EmpleadoActual | null;
  onCambiarUsuario?: () => void;
}) {
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
                {empleadoActual ? `${empleadoActual.nombre} · ${empleadoActual.rol}` : data.business.demo ? "Modo demo" : data.business.dueno}
              </span>
            </div>
            {isAdmin && (
              <Link
                href="/admin"
                className="flex shrink-0 items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/15 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-purple-300 transition-colors hover:bg-purple-500/25"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Admin
              </Link>
            )}
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Buscar"
            >
              <Search className="h-4 w-4" />
            </button>
            {empleadoActual ? (
              <button
                type="button"
                onClick={onCambiarUsuario}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Cambiar usuario / Cerrar turno"
              >
                <Users className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={logout}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
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
