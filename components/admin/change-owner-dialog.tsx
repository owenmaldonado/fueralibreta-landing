"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { searchUsersByEmail } from "@/lib/admin-data";
import type { AdminNegocio } from "@/lib/admin-data";

export function ChangeOwnerDialog({
  negocio,
  onClose,
  onSelect,
}: {
  negocio: AdminNegocio | null;
  onClose: () => void;
  onSelect: (userId: string, email: string | null) => Promise<void>;
}) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<{ id: string; email: string | null }[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!negocio) {
      setQ("");
      setResults([]);
    }
  }, [negocio]);

  React.useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      searchUsersByEmail(q)
        .then(setResults)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [q]);

  async function handleSelect(id: string, email: string | null) {
    setApplyingId(id);
    try {
      await onSelect(id, email);
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <Dialog open={!!negocio} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader title="Cambiar dueño" description={negocio ? `Negocio: ${negocio.nombre}` : undefined} onClose={onClose} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por email..." className="pl-9" />
      </div>
      <div className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
        {searching && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!searching && q.trim() && results.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin resultados.</p>
        )}
        {results.map((r) => (
          <button
            key={r.id}
            disabled={applyingId === r.id}
            onClick={() => handleSelect(r.id, r.email)}
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <Avatar src={null} label={r.email ?? "?"} className="h-7 w-7" />
            <span className="truncate">{r.email}</span>
            {applyingId === r.id && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
