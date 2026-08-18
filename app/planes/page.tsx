"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { LoadingBlock } from "@/components/app-shell/loading";
import { PlanesCards, TIPO_LABEL } from "@/components/planes/planes-cards";
import { PlanesInfo } from "@/components/planes/planes-info";
import { GiroTabs } from "@/components/planes/giro-tabs";
import { SiteFooter } from "@/components/site-footer";
import { useSession } from "@/lib/session";
import type { BusinessType } from "@/lib/types";

export default function PlanesPage() {
  const { session, ready } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<BusinessType>("abarrotes");

  if (!ready) return <LoadingBlock />;

  const tipo = session ? session.business.tipo : tab;

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        {session ? (
          <Link href="/app/inicio" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver a {session.business.nombre}
          </Link>
        ) : (
          <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
        )}
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">Planes de FueraLibreta</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session ? `Precios para tu ${TIPO_LABEL[tipo]}` : "Elige tu giro para ver los precios"}
          </p>
        </div>
        {!session && (
          <div className="mt-5">
            <GiroTabs value={tab} onChange={setTab} />
          </div>
        )}
        <div className="mt-8">
          <PlanesCards
            business={session ? session.business : { tipo }}
            mensajeExtra={session ? "Vengo desde /planes." : undefined}
          />
        </div>
        <PlanesInfo tipo={tipo} />
        {!session && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <button type="button" onClick={() => router.push("/login")} className="font-medium text-primary hover:underline">
              Inicia sesión
            </button>{" "}
            para activar tu plan directo desde aquí.
          </p>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
