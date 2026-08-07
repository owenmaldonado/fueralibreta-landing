"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

import { useSession } from "@/lib/session";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { Fab } from "./fab";
import { Button } from "@/components/ui/button";
import { waLink, NUMERO_CONTACTO } from "@/lib/mock";
import { ADMIN_EMAIL } from "@/lib/admin-data";
import { BarberiaQuickAdd, BARBERIA_ACTIONS } from "@/components/quick-add/barberia-quick-add";
import { FondaQuickAdd, FONDA_ACTIONS } from "@/components/quick-add/fonda-quick-add";
import { AbarrotesQuickAdd, ABARROTES_ACTIONS } from "@/components/quick-add/abarrotes-quick-add";

// Segmentos de /app/{segmento} que SÍ son del dueño de un negocio (barbería/
// fonda/abarrotes) y por lo tanto sí deben exigir sesión + negocio. Todo lo
// demás bajo /app/* es del dueño del SaaS: el hub (admin-hub, admin-dashboard)
// y cada módulo que cuelga de él (rentas, o el "lienzo en blanco" genérico de
// app/app/[slug]/page.tsx para cualquier app nueva). Se invierte la lista
// aquí — en vez de sumar cada módulo nuevo del hub a mano — porque esta sí es
// estable: solo cambia si se agrega una pantalla real de negocio.
const SEGMENTOS_DE_NEGOCIO = new Set([
  "agenda",
  "apartados",
  "caja",
  "clientes",
  "configuracion",
  "fiados",
  "gastos",
  "historial",
  "inicio",
  "inventario",
  "mas",
  "menu",
  "pedidos",
  "productos",
]);

function esRutaDeNegocio(pathname: string): boolean {
  if (pathname === "/app") return true;
  const segmento = pathname.split("/")[2];
  return SEGMENTOS_DE_NEGOCIO.has(segmento ?? "");
}

/**
 * Shell del negocio logueado: TopBar + banner de demo + FAB + BottomNav,
 * envolviendo el contenido de cada pantalla (children). Se usa tanto en
 * app/app/layout.tsx (para /app/*) como en <App /> (para "/" cuando ya hay
 * sesión, ver components/app/app.tsx).
 */
export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { session, ready, update } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [quickAdd, setQuickAdd] = React.useState<string | null>(null);
  const [banned, setBanned] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);

  const esRutaSuperAdmin = !esRutaDeNegocio(pathname ?? "");

  React.useEffect(() => {
    if (esRutaSuperAdmin) return;
    if (!ready || session) return;
    if (!isSupabaseConfigured) {
      router.replace("/login");
      return;
    }
    // Logueado pero sin negocio todavía (p. ej. abandonó /onboarding a medias)
    // debe volver a /onboarding, no a /login.
    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? "/onboarding" : "/login");
    });
  }, [ready, session, router, esRutaSuperAdmin]);

  React.useEffect(() => {
    if (!isSupabaseConfigured || !session) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      // isAdmin por email: no depende de que la policy de profiles esté
      // bien puesta para decidir si se muestra el botón (ver lib/admin-data.ts).
      setIsAdmin(data.user.email === ADMIN_EMAIL);
      supabase
        .from("profiles")
        .select("is_banned")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profile }) => setBanned(Boolean(profile?.is_banned)));
    });
  }, [session]);

  if (esRutaSuperAdmin) {
    return <>{children}</>;
  }

  if (!ready || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (banned) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">Cuenta bloqueada</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Tu cuenta fue bloqueada por un administrador. Contáctanos si crees que es un error.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href={waLink(NUMERO_CONTACTO, "Hola, mi cuenta está bloqueada y quiero saber por qué")} target="_blank">
            Contactar 33 2909 8631
          </Link>
        </Button>
      </main>
    );
  }

  const { business } = session;

  if (!business.is_active) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">Cuenta suspendida</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Tu cuenta de {business.nombre} está pausada. Contáctanos para reactivarla.
          </p>
        </div>
        <Button asChild size="lg">
          <Link
            href={waLink(NUMERO_CONTACTO, `Hola, mi cuenta de ${business.nombre} está suspendida, quiero reactivarla`)}
            target="_blank"
          >
            Contactar 33 2909 8631
          </Link>
        </Button>
      </main>
    );
  }

  const actions = business.tipo === "barberia" ? BARBERIA_ACTIONS : business.tipo === "fonda" ? FONDA_ACTIONS : ABARROTES_ACTIONS;

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopBar data={session} isAdmin={isAdmin} />

      {business.demo && (
        <div className="sticky top-14 z-20 flex items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2.5">
          <p className="text-xs leading-tight text-foreground">
            Estás viendo una <span className="font-semibold text-primary">demo</span> de {business.nombre}
          </p>
          <Button asChild size="sm">
            <Link href="/login">Lo quiero · $499/mes</Link>
          </Button>
        </div>
      )}

      <div className="mx-auto max-w-md">{children}</div>

      <Fab actions={actions} onSelect={setQuickAdd} />

      {business.tipo === "barberia" && (
        <BarberiaQuickAdd active={quickAdd} onClose={() => setQuickAdd(null)} session={session} update={update} />
      )}
      {business.tipo === "fonda" && (
        <FondaQuickAdd active={quickAdd} onClose={() => setQuickAdd(null)} session={session} update={update} />
      )}
      {business.tipo === "abarrotes" && (
        <AbarrotesQuickAdd active={quickAdd} onClose={() => setQuickAdd(null)} session={session} update={update} />
      )}

      <BottomNav tipo={business.tipo} />
    </div>
  );
}
