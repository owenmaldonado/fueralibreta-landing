"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageCircle, Lock, ClipboardCheck } from "lucide-react";

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
import { NUMERO_CONTACTO, waLink } from "@/lib/mock";
import { hoyEnZona } from "@/lib/fecha";
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
 * "Cerrar turno"/"Cerrar día" era lo único que sí necesitaba (era lo único
 * que lo traía a esta pantalla) — en las 3 verticales ese flujo ya vive en
 * el botón rojo de TurnoControl ("Atendiendo como X" en el header, ver
 * PROMPT "UX Vendedores - Cerrar turno"), así que Mi Plan ya no tiene nada
 * que ofrecerle a NINGÚN vendedor: redirige lejos de aquí de inmediato
 * (bottom-nav.tsx tampoco muestra el link; esto cubre un deep link directo
 * o el back del navegador). permisosActuales()/getEmpleadoActual() lee una
 * cookie — se resuelve en un efecto para no desalinear el primer render
 * del servidor con el del cliente (mismo patrón que puedeBorrar en
 * app/app/pedidos/page.tsx). Mientras tanto se asume dueño (no oculta de
 * más ni parpadea contenido real antes de tiempo).
 */
export default function MiPlanPage() {
  const router = useRouter();
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [cerrando, setCerrando] = React.useState(false);
  const [esVendedor, setEsVendedor] = React.useState(false);

  React.useEffect(() => {
    setEsVendedor(getEmpleadoActual()?.rol === "vendedor");
  }, []);

  React.useEffect(() => {
    if (esVendedor) router.replace("/app/inicio");
  }, [esVendedor, router]);

  if (!ready || !session) return <LoadingBlock />;
  if (esVendedor) return <LoadingBlock />;

  const { business } = session;
  const tipo = business.tipo;
  // plan.plan (acceso REAL, ya considera Fundador y — solo para quien SÍ
  // pagó alguna vez — la gracia de unos días en Básico después de vencer,
  // ver planDeAcceso/DIAS_GRACIA_PAGO en lib/planes.ts) en vez de
  // business.plan (lo contratado tal cual está en la fila). Quien nunca ha
  // pagado ve business.plan sin cambios mientras no venza — en cuanto
  // vence se bloquea (middleware.ts), así que esta pantalla ni se llega a
  // pintar para ese caso.
  const precio = precioPorGiro({ ...business, plan: plan.plan });
  const dias = diasParaTrial(business.trial_fin);
  const esPago = business.ultimoPagoAt != null;
  // Trial PRO de cortesía (activado desde /admin, PR #122): nunca pagó de
  // verdad pero su acceso ahora mismo es Pro/Pro+ — a diferencia del trial
  // básico normal de todo registro nuevo. Deja de ser cierto en cuanto se
  // bloquea (ver arriba), momento en el que esta pantalla ya no se pinta.
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
                  // Nunca pagó + vencido = bloqueado (middleware.ts), esta
                  // pantalla ni se pinta en ese caso — lo que sigue queda
                  // solo para quien SÍ pagó alguna vez y está en su gracia
                  // de unos días antes de bloquearse (ver DIAS_GRACIA_PAGO).
                  <p className="text-sm font-medium text-destructive">Tu plan venció hace {Math.abs(dias)} día{Math.abs(dias) === 1 ? "" : "s"}</p>
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
            {/*
              Cierres vive AQUÍ y no en "Más" a propósito. Owen: "lo mejor es
              ponerlo directo en mi plan... y así solo le aparece al dueño
              porque la sección planes solo es del dueño".
              Tiene razón: esta pantalla ya se esconde al vendedor
              (`!esVendedor`), así que no hay que volver a filtrar por rol en
              otro lado y arriesgarse a que las dos reglas se desincronicen.
            */}
            {!esVendedor && (
              <Button size="lg" variant="outline" asChild>
                <Link href="/app/cortes">
                  <ClipboardCheck className="h-4 w-4" /> Ver cierres anteriores
                </Link>
              </Button>
            )}
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
