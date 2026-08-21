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
import { getEmpleadoActual } from "@/lib/empleados";

/**
 * "Mi Plan" — saca del dashboard de Hoy (que se veía saturado en pantallas
 * chicas, ej. 360px) todo lo que no es operar el negocio día a día: ver
 * plan/trial, subir de plan, instalar la app y cerrar turno/día. Antes
 * "Cerrar turno"/"Cerrar día" vivía en el header de Hoy, "Instalar app" en
 * el TopBar y "Ver planes" solo aparecía disperso en avisos — juntarlo aquí
 * libera esas pantallas sin perder ninguna de las 3 acciones.
 *
 * Un vendedor atendiendo con PIN no debe ver nada de plan/trial/instalar
 * app/contactar soporte — ese celular puede ser un dispositivo compartido
 * del mostrador, y esas acciones son del dueño, no de quien solo cobra.
 * "Cerrar turno" es la única que sí necesita (es lo único que lo trae a
 * esta pantalla en primer lugar). permisosActuales()/getEmpleadoActual()
 * lee una cookie — se resuelve en un efecto para no desalinear el primer
 * render del servidor con el del cliente (mismo patrón que puedeBorrar en
 * app/app/pedidos/page.tsx). Mientras tanto se asume dueño (no oculta de
 * más ni parpadea contenido real antes de tiempo).
 */
export default function MiPlanPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [cerrando, setCerrando] = React.useState(false);
  const [esVendedor, setEsVendedor] = React.useState(false);

  React.useEffect(() => {
    setEsVendedor(getEmpleadoActual()?.rol === "vendedor");
  }, []);

  if (!ready || !session) return <LoadingBlock />;

  const { business } = session;
  const tipo = business.tipo;
  // plan.plan (acceso REAL, ya considera Fundador y el auto-degrade a
  // básico de un trial nunca pagado que venció — ver planDeAcceso en
  // lib/planes.ts) en vez de business.plan (lo contratado tal cual está en
  // la fila, que para un trial PRO de cortesía se queda en "pro" para
  // siempre en la base de datos aunque ya haya vencido — el degrade es
  // 100% calculado, nunca reescribe la fila).
  const precio = precioPorGiro({ ...business, plan: plan.plan });
  const dias = diasParaTrial(business.trial_fin);
  const esPago = business.ultimoPagoAt != null;
  // Trial PRO de cortesía (activado desde /admin, PR #122): nunca pagó de
  // verdad pero su acceso ahora mismo es Pro/Pro+ — a diferencia del trial
  // básico normal de todo registro nuevo. Deja de ser cierto solo en
  // cuanto planDeAcceso ya lo degradó (plan.plan volvió a "basico").
  const enTrialPro = !plan.esFundador && !esPago && plan.plan !== "basico";
  const mensajeWa = `Hola Owen! Soy ${business.dueno} de ${business.nombre}, tengo una duda sobre mi plan de FueraLibreta`;
  const labelCierre = tipo === "abarrotes" ? "Cerrar día" : "Cerrar turno";

  return (
    <>
      <PageHeader title="Mi Plan" subtitle={business.nombre} />
      <div className="grid gap-4 p-4">
        {!esVendedor && (
          <>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Plan actual</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="font-display text-2xl font-bold tracking-tight">
                  {plan.esFundador ? "Fundador" : PLAN_LABELS[plan.plan]}
                </p>
                {plan.esFundador && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">👑</span>}
                {enTrialPro && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                    Prueba {dias >= 0 ? `${dias}d` : "gratis"}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">${precio}/mes</p>

              <div className="mt-3 rounded-xl bg-secondary/60 px-3 py-2.5">
                {plan.esFundador ? (
                  <p className="text-sm font-medium text-ledger">Acceso completo, sin fecha de vencimiento</p>
                ) : dias < 0 ? (
                  esPago ? (
                    <p className="text-sm font-medium text-destructive">Tu plan venció hace {Math.abs(dias)} día{Math.abs(dias) === 1 ? "" : "s"}</p>
                  ) : (
                    // Nunca pagó: la prueba (básica o Pro de cortesía) ya
                    // terminó, pero nunca se bloquea — solo bajó a Básico en
                    // automático (ver planDeAcceso). Nada que alarme aquí.
                    <p className="text-sm font-medium text-muted-foreground">Tu prueba gratis terminó — ahora estás en Básico</p>
                  )
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
          </>
        )}

        <div className="rounded-2xl border border-border bg-card p-4">
          {!esVendedor && <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Más acciones</p>}
          <div className="flex flex-col gap-2">
            {!esVendedor && <InstallPrompt />}
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
