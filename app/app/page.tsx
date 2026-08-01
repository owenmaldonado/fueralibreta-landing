"use client";

import { Loader2 } from "lucide-react";

import { useSession } from "@/lib/session";
import { BarberiaDashboard } from "@/components/dashboards/barberia-dashboard";
import { FondaDashboard } from "@/components/dashboards/fonda-dashboard";
import { AbarrotesDashboard } from "@/components/dashboards/abarrotes-dashboard";

export default function AppHomePage() {
  const { session, ready, update } = useSession();

  if (!ready || !session) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session.business.tipo === "barberia") return <BarberiaDashboard session={session} update={update} />;
  if (session.business.tipo === "fonda") return <FondaDashboard session={session} update={update} />;
  return <AbarrotesDashboard session={session} update={update} />;
}
