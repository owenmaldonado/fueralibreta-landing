"use client";

import * as React from "react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { supabase } from "@/lib/supabase";
import { formatMoney, uid } from "@/lib/mock";
import type { TenantData, SessionUpdater, Expense } from "@/lib/types";

type MermaTipo = "acabado" | "sobro_poco" | "sobro_mucho" | "tirado";

const OPCIONES_MERMA: { tipo: MermaTipo; label: string }[] = [
  { tipo: "acabado", label: "Se acabó todo ✅" },
  { tipo: "sobro_poco", label: "Sobró poco para mañana" },
  { tipo: "sobro_mucho", label: "Sobró mucho para mañana" },
  { tipo: "tirado", label: "Se tiró 🗑️" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  session: TenantData;
  update: SessionUpdater;
  hoyEnSuZona: string;
}

/**
 * "Cerrar Turno": wizard de 2 pasos, pensado para el ritmo de fin de día de
 * una fonda, no para contabilidad exacta.
 *
 * Paso 1 (Corte) guarda efectivo real y gasto del día tal cual los reporta
 * el dueño — NO calcula ni muestra un "faltante" (real vs. esperado): eso es
 * justo el número estresante que este wizard evita. fondita_cortes es solo
 * bitácora (mismo patrón write-only que fondita_menu_dia del prompt 1/2):
 * se escribe directo a Supabase para negocios reales, nada la lee todavía.
 *
 * Paso 2 (Merma) sí tiene efecto en vivo: "Sobró" dócil mantiene el platillo
 * activo para mañana y le pone un badge (ver estadoMerma en Dish/Menú); "Se
 * acabó"/"Se tiró" lo apaga (mañana hay que prenderlo a mano si se repite).
 * Un "Se tiró" con monto Y con costo_opcional definido en el platillo se
 * convierte en un Expense real (mismo mecanismo que cualquier gasto manual,
 * ya fluye a la gráfica de Gastos/Ventas vía el sync genérico). Sin costo no
 * inventamos una pérdida "real" — eso sería el -$510 falso del prompt — así
 * que solo queda en la bitácora fondita_mermas y se avisa en pantalla.
 */
export function CerrarTurnoSheet({ open, onClose, session, update, hoyEnSuZona }: Props) {
  const [paso, setPaso] = React.useState<1 | 2>(1);
  const [efectivoReal, setEfectivoReal] = React.useState("");
  const [gastoDia, setGastoDia] = React.useState("");
  const [decisiones, setDecisiones] = React.useState<Record<string, { tipo: MermaTipo; monto?: string }>>({});
  const [guardando, setGuardando] = React.useState(false);

  const data = session.fonda!;
  const negocio = session.business;
  const esNegocioReal = Boolean(negocio.ownerId);

  const ventasHoy = data.pedidos
    .filter((p) => p.estado === "entregado" && p.fecha === hoyEnSuZona)
    .reduce((acc, p) => acc + p.total, 0);

  const disponiblesHoy = data.platillos.filter((p) => p.activoHoy);
  const vendidosPorPlatillo = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of data.pedidos) {
      if (p.fecha !== hoyEnSuZona) continue;
      for (const it of p.items) {
        mapa.set(it.platilloId, (mapa.get(it.platilloId) ?? 0) + it.cantidad);
      }
    }
    return mapa;
  }, [data.pedidos, hoyEnSuZona]);

  function resetYCerrar() {
    setPaso(1);
    setEfectivoReal("");
    setGastoDia("");
    setDecisiones({});
    onClose();
  }

  async function guardarCorte() {
    if (esNegocioReal) {
      const { error } = await supabase.from("fondita_cortes").insert({
        negocio_id: negocio.id,
        fecha: hoyEnSuZona,
        ventas_del_dia: ventasHoy,
        efectivo_real: efectivoReal.trim() === "" ? null : Number(efectivoReal),
        gasto_dia: gastoDia.trim() === "" ? null : Number(gastoDia),
      });
      if (error) console.error("No se pudo guardar el corte:", error);
    }
    setPaso(2);
  }

  function elegir(platilloId: string, tipo: MermaTipo) {
    setDecisiones((prev) => ({ ...prev, [platilloId]: { tipo, monto: prev[platilloId]?.monto } }));
  }

  function setMontoTirado(platilloId: string, monto: string) {
    setDecisiones((prev) => ({ ...prev, [platilloId]: { tipo: "tirado", monto } }));
  }

  async function terminarMerma() {
    setGuardando(true);
    const mermaRows: Record<string, unknown>[] = [];
    const nuevosGastos: Expense[] = [];

    for (const p of disponiblesHoy) {
      const decision = decisiones[p.id];
      if (!decision) continue;
      const montoTirado = decision.tipo === "tirado" && decision.monto ? Number(decision.monto) : undefined;

      mermaRows.push({
        negocio_id: negocio.id,
        fecha: hoyEnSuZona,
        producto_id: p.id,
        producto_nombre: p.nombre,
        tipo: decision.tipo,
        monto_tirado: montoTirado ?? null,
        tenia_costo: p.costo != null,
      });

      if (decision.tipo === "tirado" && montoTirado && montoTirado > 0 && p.costo != null) {
        nuevosGastos.push({ id: uid("exp"), categoria: `Merma: ${p.nombre}`, monto: montoTirado, fecha: hoyEnSuZona });
      }
    }

    if (esNegocioReal && mermaRows.length > 0) {
      const { error } = await supabase.from("fondita_mermas").insert(mermaRows);
      if (error) console.error("No se pudieron guardar las mermas:", error);
    }

    update((prev) => {
      const f = prev.fonda!;
      const platillos = f.platillos.map((p) => {
        const decision = decisiones[p.id];
        if (!decision) return p;
        if (decision.tipo === "sobro_poco" || decision.tipo === "sobro_mucho") {
          return { ...p, estadoMerma: decision.tipo };
        }
        // "Se acabó todo" y "Se tiró" no dejan nada para mañana.
        return { ...p, activoHoy: false, estadoMerma: undefined };
      });
      const gastos = nuevosGastos.length > 0 ? [...nuevosGastos, ...f.gastos] : f.gastos;
      return { ...prev, fonda: { ...f, platillos, gastos } };
    });

    setGuardando(false);
    resetYCerrar();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && resetYCerrar()}>
      {paso === 1 ? (
        <>
          <SheetHeader title="Cerrar turno" description="Paso 1 de 2 · Corte" onClose={resetYCerrar} />
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ventas de hoy (calculadas)</p>
              <p className="font-display text-2xl font-bold text-ledger">{formatMoney(ventasHoy)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>¿Efectivo real en mano?</Label>
              <Input type="number" inputMode="decimal" value={efectivoReal} onChange={(e) => setEfectivoReal(e.target.value)} placeholder="$0" />
            </div>
            <div className="space-y-1.5">
              <Label>¿Gastaste hoy?</Label>
              <Input type="number" inputMode="decimal" value={gastoDia} onChange={(e) => setGastoDia(e.target.value)} placeholder="$0" />
            </div>
          </div>
          <SheetFooter>
            <Button size="lg" onClick={guardarCorte}>
              Continuar a Merma
            </Button>
          </SheetFooter>
        </>
      ) : (
        <>
          <SheetHeader title="Cerrar turno" description="Paso 2 de 2 · Merma" onClose={resetYCerrar} />
          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
            {disponiblesHoy.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">No había platillos disponibles hoy.</p>
            ) : (
              disponiblesHoy.map((p) => {
                const decision = decisiones[p.id];
                const vendidos = vendidosPorPlatillo.get(p.id) ?? 0;
                return (
                  <div key={p.id} className="rounded-xl border border-border bg-card p-3">
                    <p className="text-sm font-semibold">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">Hoy vendiste {vendidos}</p>
                    <ChipGroup className="mt-2">
                      {OPCIONES_MERMA.map((op) => (
                        <Chip key={op.tipo} selected={decision?.tipo === op.tipo} onClick={() => elegir(p.id, op.tipo)}>
                          {op.label}
                        </Chip>
                      ))}
                    </ChipGroup>
                    {decision?.tipo === "tirado" && (
                      <div className="mt-2 space-y-1">
                        <Input
                          type="number"
                          inputMode="decimal"
                          autoFocus
                          value={decision.monto ?? ""}
                          onChange={(e) => setMontoTirado(p.id, e.target.value)}
                          placeholder="¿Cuánto aprox tiraste? $"
                        />
                        {p.costo == null && (
                          <p className="text-xs text-muted-foreground">Agrega costo a este platillo para ver su pérdida real.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <SheetFooter>
            <Button size="lg" disabled={guardando} onClick={terminarMerma}>
              Terminar cierre
            </Button>
          </SheetFooter>
        </>
      )}
    </Sheet>
  );
}
