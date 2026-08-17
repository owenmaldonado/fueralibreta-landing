"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import { LoadingBlock } from "@/components/app-shell/loading";
import { Button } from "@/components/ui/button";
import { PlanesCards } from "@/components/planes/planes-cards";
import { SiteFooter } from "@/components/site-footer";
import { useSession } from "@/lib/session";
import { cerrarSesion } from "@/lib/logout";

export default function PlanesBloqueadoPage() {
  const { session, ready } = useSession();
  const router = useRouter();

  if (!ready) return <LoadingBlock />;

  if (!session) {
    router.replace("/login");
    return <LoadingBlock />;
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <Lock className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Se acabaron tus 7 días gratis</h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {session.business.nombre} sigue guardado tal cual lo dejaste — elige un plan para seguir usándolo.
            </p>
          </div>
        </div>
        <div className="mt-8">
          <PlanesCards business={session.business} mensajeExtra="Se me acabaron 7 días gratis." />
        </div>
        <div className="mt-6 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => cerrarSesion(session.business.id, (href) => router.push(href))}
          >
            Cambiar de cuenta / Cerrar sesión
          </Button>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
