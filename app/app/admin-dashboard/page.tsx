import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Building2 } from "lucide-react";

import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { ADMIN_EMAIL } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

interface NegocioRow {
  id: string;
  nombre: string;
  telefono: string;
  created_at: string;
}

/**
 * Listado básico de negocios (id, nombre, teléfono, fecha de creación) para
 * el dueño del SaaS. Gateado server-side por profiles.role==='admin' — el
 * mismo chequeo real que usa /admin. Para gestión completa (plan, banear,
 * suplantar, eliminar, cambiar owner) cada fila enlaza al detalle en /admin.
 */
export default async function AdminDashboardPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" || user.email !== ADMIN_EMAIL) redirect("/");

  const { data: negocios } = await supabase
    .from("negocios")
    .select("id, nombre, telefono, created_at")
    .order("created_at", { ascending: false });

  const lista = (negocios ?? []) as NegocioRow[];

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">Panel de negocios</h1>
          <p className="text-sm text-muted-foreground">{lista.length} negocios registrados</p>
        </div>
      </div>

      <div className="mb-4">
        <Link href="/admin" className="text-sm text-primary underline-offset-4 hover:underline">
          Ir al panel completo de administración →
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {lista.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            Todavía no hay negocios registrados.
          </p>
        ) : (
          lista.map((n) => (
            <Link
              key={n.id}
              href={`/admin?negocio=${n.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{n.nombre}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {n.telefono || "Sin teléfono"} · {new Date(n.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/60">{n.id}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
