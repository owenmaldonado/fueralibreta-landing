"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { EmptyState } from "@/components/dashboards/empty-state";
import { StatTile } from "@/components/dashboards/stat-tile";
import { EmpleadoBadge } from "@/components/dashboards/empleado-badge";
import { useSession } from "@/lib/session";
import { fetchCortes, marcarCorteRevisado, TABLA_CORTES, type Corte } from "@/lib/cortes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
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

/**
 * Umbral SOLO para el aviso rojo de arriba, no para lo que dice cada cierre.
 *
 * Owen: "hay una diferencia de 11 pesos pero dice que cuadró; si no es
 * perfecto entonces no cuadra". Tiene razón, y era mi error: la tolerancia
 * de $20 se estaba aplicando también a la etiqueta de cada cierre, así que
 * un faltante real de $11 se pintaba en verde como "Cuadró". Eso no es
 * tolerar ruido, es esconder dinero.
 *
 * Ahora cada cierre dice SIEMPRE su número exacto — "Cuadró" solo cuando la
 * diferencia es cero de verdad. Este umbral se queda únicamente para decidir
 * si el aviso rojo de arriba grita o no, que es otra pregunta: no toda
 * diferencia amerita una alarma, pero todas se muestran.
 */
const UMBRAL_ALARMA = 20;

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
  // Qué cierre tiene el cuadro de nota abierto, y qué se lleva escrito.
  const [revisando, setRevisando] = React.useState<string | null>(null);
  const [nota, setNota] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  const negocioId = session?.business.id;
  const tipo = session?.business.tipo;

  React.useEffect(() => {
    if (!negocioId || !tipo) return;
    let cancelado = false;

    function traer() {
      fetchCortes(negocioId!, tipo!)
        .then((filas) => {
          if (!cancelado) setCortes(filas);
        })
        .catch((err) => {
          if (!cancelado) setError(err instanceof Error ? err.message : "No se pudieron cargar los cierres.");
        });
    }
    traer();

    // EN VIVO. Owen: "cuando un vendedor cierra turno no sale en la app hasta
    // que no reseteas". Es el momento en que se entrega el dinero, así que es
    // de lo que más urge ver al instante.
    //
    // Las tres tablas de cortes ya están en la publicación de realtime
    // (migración 20260917000000). Al llegar un INSERT se vuelve a pedir la
    // lista completa en vez de insertar la fila del payload: son pocas filas,
    // y así el orden y el formato salen del MISMO lugar que la carga inicial
    // (fetchCortes) en vez de tener dos caminos que se pueden desincronizar.
    const canal = supabase
      .channel(`cortes-${negocioId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLA_CORTES[tipo], filter: `negocio_id=eq.${negocioId}` },
        () => traer()
      )
      .subscribe((status, err) => {
        console.log("[cortes] canal de cierres:", status, err ?? "");
      });

    // Red de seguridad por si el canal no entrega — mismo criterio que
    // lib/refresco-respaldo.ts: el canal es el camino rápido, esto es el piso.
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      traer();
    }, 15_000);

    return () => {
      cancelado = true;
      clearInterval(timer);
      supabase.removeChannel(canal);
    };
  }, [negocioId, tipo]);

  async function guardarRevision(corte: Corte, revisar: boolean) {
    if (!tipo) return;
    setGuardando(true);
    try {
      const res = await marcarCorteRevisado(tipo, corte.id, nota, revisar);
      setCortes((prev) =>
        (prev ?? []).map((c) => (c.id === corte.id ? { ...c, revisadoAt: res.revisadoAt, revisadoNota: res.revisadoNota } : c))
      );
      setRevisando(null);
      setNota("");
      toast.success(revisar ? "Cierre marcado como revisado." : "Se quitó la marca de revisado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar. Revisa tu conexión.");
    } finally {
      setGuardando(false);
    }
  }

  if (!ready || !session) return <LoadingBlock />;

  const queEs = tipo === "abarrotes" ? "día" : "turno";
  // Un cierre ya revisado deja de contar para el aviso rojo. Owen: "para
  // que no le salga siempre, solo si lo necesita lo puede borrar". El aviso
  // es útil la primera vez y ruido a partir de la segunda: si un faltante ya
  // se aclaró con el vendedor, seguir viéndolo en rojo solo entrena a
  // ignorarlo — y el día que aparezca uno de verdad ya no se ve.
  const conFaltante = (cortes ?? []).filter(
    (c) => c.diferencia != null && c.diferencia < -UMBRAL_ALARMA && !c.revisadoAt
  );
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
            // Exacto: cualquier diferencia distinta de cero se muestra tal
            // cual. Solo el color se suaviza si es chica.
            const falta = dif < 0;
            const sobra = dif > 0;
            const fuerte = Math.abs(dif) > UMBRAL_ALARMA;
            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-2xl border bg-card p-4",
                  falta && fuerte ? "border-destructive/40" : sobra && fuerte ? "border-primary/40" : "border-border"
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

                {falta && fuerte && !c.revisadoAt && (
                  <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                    Faltaron {formatMoney(-dif)} contra lo que debía haber en la caja.
                  </p>
                )}
                {sobra && fuerte && !c.revisadoAt && (
                  <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                    Sobraron {formatMoney(dif)}. Suele ser una venta que no se registró.
                  </p>
                )}

                {/*
                  La nota del dueño. Nunca reemplaza a la diferencia — se
                  muestra AL LADO, para explicar el faltante sin taparlo.
                */}
                {c.revisadoAt && (
                  <div className="mt-3 rounded-xl border border-border bg-background/40 px-3 py-2">
                    <p className="text-xs font-medium text-ledger">✓ Revisado</p>
                    {c.revisadoNota && <p className="mt-0.5 text-xs text-muted-foreground">{c.revisadoNota}</p>}
                    <button
                      type="button"
                      onClick={() => guardarRevision(c, false)}
                      disabled={guardando}
                      className="mt-1.5 text-[11px] text-muted-foreground underline underline-offset-2 disabled:opacity-50"
                    >
                      Quitar la marca
                    </button>
                  </div>
                )}

                {dif !== 0 && !c.revisadoAt && (
                  revisando === c.id ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <Input
                        autoFocus
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="¿Por qué? Ej. le di mal el cambio a un cliente"
                        maxLength={140}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        La diferencia se queda como está — esto solo apaga el aviso y guarda tu explicación.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => guardarRevision(c, true)} disabled={guardando}>
                          {guardando ? "Guardando..." : "Ya lo revisé"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setRevisando(null); setNota(""); }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setRevisando(c.id); setNota(""); }}
                      className="mt-3 text-xs text-primary underline underline-offset-2"
                    >
                      Ya lo revisé
                    </button>
                  )
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
