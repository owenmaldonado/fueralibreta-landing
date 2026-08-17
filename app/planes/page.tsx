"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { LoadingBlock } from "@/components/app-shell/loading";
import { PlanesCards } from "@/components/planes/planes-cards";
import { SiteFooter } from "@/components/site-footer";
import { useSession } from "@/lib/session";

export default function PlanesPage() {
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
        <Link href="/app/inicio" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a {session.business.nombre}
        </Link>
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">Planes de FueraLibreta</h1>
          <p className="mt-2 text-sm text-muted-foreground">Elige el plan que mejor le queda a tu negocio.</p>
        </div>
        <div className="mt-8">
          <PlanesCards business={session.business} mensajeExtra="Vengo desde /planes." />
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
