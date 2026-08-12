"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { waLink, NUMERO_CONTACTO } from "@/lib/mock";

/**
 * A dónde manda middleware.ts a cualquier sesión con profiles.is_banned —
 * bloquea el acceso ANTES de que /app/* llegue a renderizar nada (la
 * pantalla de "Cuenta bloqueada" dentro de AuthenticatedShell sigue ahí como
 * respaldo, por si is_banned cambia a mitad de sesión sin una navegación de
 * por medio que dispare middleware de nuevo).
 */
export default function CuentaSuspendidaPage() {
  async function cerrarSesion() {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    window.location.href = "/login";
  }

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
      <button type="button" onClick={cerrarSesion} className="text-xs text-muted-foreground underline underline-offset-2">
        Cerrar sesión
      </button>
    </main>
  );
}
