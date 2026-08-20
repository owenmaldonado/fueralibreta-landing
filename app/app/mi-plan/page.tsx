"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle, Lock } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Button } from "@/components/ui/button";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { CerrarTurnoSheet as FondaCerrarTurnoSheet } from "@/components/dashboards/fonda-cerrar-turno";
import { CerrarTurnoSheet as BarberiaCerrarTurnoSheet } from "@/components/dashboards/barberia-cerrar-turno";
import { CerrarDiaSheet } from "@/components/dashboards/abarrotes-cerrar-dia";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { diasParaTrial, precioPorGiro, PLAN_LABELS } from "@/lib/planes";
import { NUMERO_CONTACTO, hoyEnZona, waLink } from "@/lib/mock";

/**
 * "Mi Plan" — saca del dashboard de Hoy (que se veía saturado en pantallas
 * chicas, ej. 360px) todo lo que no es operar el negocio día a día: ver
 * plan/trial, subir de plan, instalar la app y cerrar turno/día. Antes
 * "Cerrar turno"/"Cerrar día" vivía en el header de Hoy, "Instalar app" en
 * el TopBar y "Ver planes" solo aparecía disperso en avisos — juntarlo aquí
 * libera esas pantallas sin perder ninguna de las 3 acciones.
 */
export default function MiPlanPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [cerrando, setCerrando] = React.useState(false);

  if (!ready || !session) return <LoadingBlock />;

  const { business } = session;
  const tipo = business.tipo;
  const precio = precioPorGiro(business);
  const dias = diasParaTrial(business.trial_fin);
  const esPago = plan.planContratado !== "basico";
  const mensajeWa = `Hola Owen! Soy ${business.dueno} de ${business.nombre}, tengo una duda sobre mi plan de FueraLibreta`;
  const labelCierre = tipo === "abarrotes" ? "Cerrar día" : "Cerrar turno";

  return (
    <>
      <PageHeader title="Mi Plan" subtitle={business.nombre} />
      <div className="grid gap-4 p-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Plan actual</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-display text-2xl font-bold tracking-tight">
              {plan.esFundador ? "Fundador" : PLAN_LABELS[plan.planContratado]}
            </p>
            {plan.esFundador && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">👑</span>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">${precio}/mes</p>

          <div className="mt-3 rounded-xl bg-secondary/60 px-3 py-2.5">
            {plan.esFundador ? (
              <p className="text-sm font-medium text-ledger">Acceso completo, sin fecha de vencimiento</p>
            ) : dias < 0 ? (
              <p className="text-sm font-medium text-destructive">Tu {esPago ? "plan" : "prueba gratis"} venció hace {Math.abs(dias)} día{Math.abs(dias) === 1 ? "" : "s"}</p>
            ) : dias === 0 ? (
              <p className="text-sm font-medium text-primary">{esPago ? "Tu plan vence hoy" : "Tu prueba gratis vence hoy"}</p>
            ) : (
              <p className="text-sm font-medium">
                {esPago ? "Tu plan vence en" : "Te quedan"} <span className="text-primary">{dias} día{dias === 1 ? "" : "s"}</span>
              </p>
            )}
          </div>

          <Button asChild size="lg" className="mt-3 w-full">
            <Link href="/planes">
              Ver todos los planes <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">¿Dudas o problemas?</p>
          <p className="mt-1 text-sm text-muted-foreground">Escríbele directo a Owen por WhatsApp</p>
          <Button asChild size="lg" variant="ledger" className="mt-3 w-full">
            <a href={waLink(NUMERO_CONTACTO, mensajeWa)} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> Contactar por WhatsApp
            </a>
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Más acciones</p>
          <div className="mt-3 flex flex-col gap-2">
            <InstallPrompt />
            <Button size="lg" variant="outline" onClick={() => setCerrando(true)}>
              <Lock className="h-4 w-4" /> {labelCierre}
            </Button>
          </div>
        </div>
      </div>

      {tipo === "fonda" && (
        <FondaCerrarTurnoSheet open={cerrando} onClose={() => setCerrando(false)} session={session} update={update} hoyEnSuZona={hoyEnZona(business.timezone)} />
      )}
      {tipo === "barberia" && <BarberiaCerrarTurnoSheet open={cerrando} onClose={() => setCerrando(false)} session={session} update={update} />}
      {tipo === "abarrotes" && <CerrarDiaSheet open={cerrando} onClose={() => setCerrando(false)} session={session} update={update} />}
    </>
  );
}
