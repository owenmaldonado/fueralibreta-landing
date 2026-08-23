"use client";

import * as React from "react";
import { Search, Copy } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

interface ClienteResult {
  id: string;
  nombre: string;
  telefono: string;
  negocio_id: string;
  negocio_nombre: string;
  negocio_tipo: string;
  visitas: number;
  created_at: string;
}

export function ClientesSearch() {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ClienteResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);

    try {
      // Search in barberia_clientes
      const [barberiaRes, fondaRes, abarrotesRes] = await Promise.all([
        supabase
          .from("barberia_clientes")
          .select("id, nombre, telefono, negocio_id, visitas, created_at")
          .or(`id.ilike.%${query}%,nombre.ilike.%${query}%,telefono.ilike.%${query}%`)
          .limit(50),
        supabase
          .from("fonda_clientes")
          .select("id, nombre, telefono, negocio_id, visitas, created_at")
          .or(`id.ilike.%${query}%,nombre.ilike.%${query}%,telefono.ilike.%${query}%`)
          .limit(50),
        supabase
          .from("abarrotes_clientes")
          .select("id, nombre, telefono, negocio_id, visitas, created_at")
          .or(`id.ilike.%${query}%,nombre.ilike.%${query}%,telefono.ilike.%${query}%`)
          .limit(50),
      ]);

      const results: ClienteResult[] = [];

      // Process barberia results
      if (barberiaRes.data) {
        for (const c of barberiaRes.data) {
          const { data: negocio } = await supabase
            .from("negocios")
            .select("nombre, tipo")
            .eq("id", c.negocio_id)
            .maybeSingle();
          results.push({
            id: c.id,
            nombre: c.nombre,
            telefono: c.telefono,
            negocio_id: c.negocio_id,
            negocio_nombre: negocio?.nombre ?? "—",
            negocio_tipo: negocio?.tipo ?? "barberia",
            visitas: c.visitas,
            created_at: c.created_at,
          });
        }
      }

      // Process fonda results
      if (fondaRes.data) {
        for (const c of fondaRes.data) {
          const { data: negocio } = await supabase
            .from("negocios")
            .select("nombre, tipo")
            .eq("id", c.negocio_id)
            .maybeSingle();
          results.push({
            id: c.id,
            nombre: c.nombre,
            telefono: c.telefono,
            negocio_id: c.negocio_id,
            negocio_nombre: negocio?.nombre ?? "—",
            negocio_tipo: negocio?.tipo ?? "fonda",
            visitas: c.visitas,
            created_at: c.created_at,
          });
        }
      }

      // Process abarrotes results
      if (abarrotesRes.data) {
        for (const c of abarrotesRes.data) {
          const { data: negocio } = await supabase
            .from("negocios")
            .select("nombre, tipo")
            .eq("id", c.negocio_id)
            .maybeSingle();
          results.push({
            id: c.id,
            nombre: c.nombre,
            telefono: c.telefono,
            negocio_id: c.negocio_id,
            negocio_nombre: negocio?.nombre ?? "—",
            negocio_tipo: negocio?.tipo ?? "abarrotes",
            visitas: c.visitas,
            created_at: c.created_at,
          });
        }
      }

      setResults(results);
    } catch (err) {
      console.error("Search error:", err);
      toast.error("Error en la búsqueda");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copiado");
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Buscar por ID, nombre o teléfono..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={loading} variant="default">
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {hasSearched && results.length === 0 && !loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">No se encontraron clientes.</p>
      )}

      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">Buscando...</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{results.length} resultado(s)</p>
          {results.map((cliente) => (
            <div key={`${cliente.negocio_id}-${cliente.id}`} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <p className="font-medium">{cliente.nombre}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {cliente.negocio_nombre}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {cliente.negocio_tipo}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {cliente.visitas} visita{cliente.visitas !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {cliente.telefono} · ID: {cliente.id}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Registrado:{" "}
                    {new Date(cliente.created_at).toLocaleDateString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => copyToClipboard(cliente.id)}
                  title="Copiar ID"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
