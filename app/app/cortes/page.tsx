"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { EmptyState } from "@/components/dashboards/empty-state";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmpleadoBadge } from "@/components/dashboards/empleado-badge";
import { useSession } from "@/lib/session";
import { fetchCortes, type Corte } from "@/lib/cortes";
import { formatMoney, formatMoneyExacto } from "@/lib/mock";
import { cn } from "@/lib/utils";

/**
 * Reporte de cierres para el DUEÑO. Ruta solo-dueño (middleware.ts).
 *
 * PARA QUÉ ES
 * Owen: "sin decirle al vendedor cuánto debería tener, y si hubo alguna
 * diferencia pudo haberle robado o así. Quiero que en el panel del dueño
 * salga lo que hizo su vendedor en el cierre, y ahí vea inconsistencias
 * como esa y le avise: ¡le faltó tanto!"
 *
 * El diseño depende de una cosa: el vendedor cierra A CIEGAS. En su
 * pantalla no ve "deberías tener $X" (ver MensajeCorte y el permiso
 * verCorteDelDia) — solo cuenta el efectivo que tiene en la mano y lo
 * captura. Por eso una diferencia AQUÍ significa algo: nadie pudo cuadrar
 * el número a propósito, porque nadie sabía cuál era.
 *
 * Un faltante NO es una acusación, y la pantalla no lo presenta como tal.
 * Un billete que se pegó a otro, un cambio mal dado, una venta que se
 * cobró en efectivo y se anotó como transferencia — todo eso da faltante.
 * Lo que la pantalla hace es enseñárselo al dueño para que pregunte, que
 * es lo único que puede hacer un software honesto con este dato.
 */

/** Un faltante/sobrante de $20 o menos es ruido de cambio, no algo que valga la pena señalar. */
const TOLERANCIA = 20;

function fechaLegible(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function horaLegible(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

export default function CortesPage() {
  const { session, ready } = useSession();
  const [cortes, setCortes] = React.useState<Corte[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const negocioId = session?.business.id;
  const tipo = session?.business.tipo;

  React.useEffect(() => {
    if (!negocioId || !tipo) return;
    let cancelado = false;
    fetchCortes(negocioId, tipo)
      .then((filas) => {
        if (!cancelado) setCortes(filas);
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof Error ? err.message : "No se pudieron cargar los cierres.");
      });
    return () => {
      cancelado = true;
    };
  }, [negocioId, tipo]);

  if (!ready || !session) return <LoadingBlock />;

  const queEs = tipo === "abarrotes" ? "día" : "turno";
  const conFaltante = (cortes ?? []).filter((c) => c.diferencia != null && c.diferencia < -TOLERANCIA);
  const faltanteTotal = conFaltante.reduce((acc, c) => acc + Math.abs(c.diferencia ?? 0), 0);

  return (
    <>
      <PageHeader title="Cierres" subtitle={`Cada ${queEs} cerrado, quién lo cerró y si cuadró`} />

      <div className="flex flex-col gap-4 p-4">
        {/* El aviso de arriba: lo primero que el dueño tiene que ver. */}
        {conFaltante.length > 0 && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-destructive">
                  {conFaltante.length === 1
                    ? `Un cierre no cuadró: faltaron ${formatMoney(faltanteTotal)}`
                    : `${conFaltante.length} cierres no cuadraron: faltan ${formatMoney(faltanteTotal)} en total`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quien cierra no ve cuánto debería haber en la caja, así que estas diferencias no se pueden cuadrar a propósito.
                  Puede ser cambio mal dado o una venta anotada con el método equivocado — vale la pena preguntar.
                </p>
              </div>
            </div>
          </div>
        )}

        {cortes && cortes.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <StatTile label={`${queEs === "día" ? "Días" : "Turnos"} cerrados`} value={String(cortes.length)} />
            <StatTile label="Sin cuadrar" value={String(conFaltante.length)} />
          </div>
        )}

        {error ? (
          <EmptyState texto={error} />
        ) : cortes === null ? (
          <LoadingBlock />
        ) : cortes.length === 0 ? (
          <EmptyState texto={`Todavía no se ha cerrado ningún ${queEs}`} />
        ) : (
          cortes.map((c) => {
            const dif = c.diferencia ?? 0;
            // "Esperado" se reconstruye del propio corte en vez de guardarse
            // aparte: efectivo contado - diferencia ES, por definición, lo
            // que debía haber. Así el número que ve el dueño sale del mismo
            // dato que se guardó al cerrar y no puede desincronizarse.
            const esperado = c.efectivoReal != null ? c.efectivoReal - dif : null;
            const falta = dif < -TOLERANCIA;
            const sobra = dif > TOLERANCIA;
            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-2xl border bg-card p-4",
                  falta ? "border-destructive/40" : sobra ? "border-primary/40" : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold capitalize">{fechaLegible(c.fecha)}</p>
                    <p className="text-xs text-muted-foreground">Cerrado {horaLegible(c.creadoEn)}</p>
                    <div className="mt-1.5">
                      <EmpleadoBadge nombre={c.empleadoNombreCache} rol={c.empleadoRolCache} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Diferencia</p>
                    <p
                      className={cn(
                        "font-display text-lg font-bold",
                        falta ? "text-destructive" : sobra ? "text-primary" : "text-ledger"
                      )}
                    >
                      {falta ? `-${formatMoney(-dif)}` : sobra ? `+${formatMoney(dif)}` : "Cuadró"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs">
                  <span className="text-muted-foreground">Vendido</span>
                  <span className="text-right font-mono">{formatMoneyExacto(c.ventasCalculadas)}</span>
                  {c.fondoInicial != null && c.fondoInicial > 0 && (
                    <>
                      <span className="text-muted-foreground">Fondo inicial</span>
                      <span className="text-right font-mono">{formatMoneyExacto(c.fondoInicial)}</span>
                    </>
                  )}
                  {c.propinasTotal != null && c.propinasTotal > 0 && (
                    <>
                      <span className="text-muted-foreground">Propinas</span>
                      <span className="text-right font-mono">{formatMoneyExacto(c.propinasTotal)}</span>
                    </>
                  )}
                  {c.gastos != null && c.gastos > 0 && (
                    <>
                      <span className="text-muted-foreground">Gastos</span>
                      <span className="text-right font-mono text-destructive">-{formatMoneyExacto(c.gastos)}</span>
                    </>
                  )}
                  {c.gastosMaterial != null && c.gastosMaterial > 0 && (
                    <>
                      <span className="text-muted-foreground">Material</span>
                      <span className="text-right font-mono text-destructive">-{formatMoneyExacto(c.gastosMaterial)}</span>
                    </>
                  )}
                  {esperado != null && (
                    <>
                      <span className="font-medium text-foreground">Debía haber</span>
                      <span className="text-right font-mono font-medium">{formatMoneyExacto(esperado)}</span>
                    </>
                  )}
                  <span className="font-medium text-foreground">Contó</span>
                  <span className="text-right font-mono font-medium">
                    {c.efectivoReal != null ? formatMoneyExacto(c.efectivoReal) : "—"}
                  </span>
                </div>

                {falta && (
                  <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                    Faltaron {formatMoney(-dif)} contra lo que debía haber en la caja.
                  </p>
                )}
                {sobra && (
                  <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                    Sobraron {formatMoney(dif)}. Suele ser una venta que no se registró.
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
