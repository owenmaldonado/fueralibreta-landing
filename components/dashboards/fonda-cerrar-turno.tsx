"use client";

import * as React from "react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { VentasPorEmpleado } from "./ventas-por-empleado";
import { supabase } from "@/lib/supabase";
import { formatMoney, mensajeDiferencia, uid } from "@/lib/mock";
import { camposEmpleado } from "@/lib/empleados";
import type { TenantData, SessionUpdater, Expense } from "@/lib/types";

type MermaTipo = "acabado" | "sobro_poco" | "sobro_mucho" | "tirado";

const OPCIONES_MERMA: { tipo: MermaTipo; label: string }[] = [
  { tipo: "acabado", label: "Se acabó ✅" },
  { tipo: "sobro_poco", label: "Sobró poco" },
  { tipo: "sobro_mucho", label: "Sobró mucho" },
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
 * "Cerrar Turno": wizard de 2 pasos, esquema base UNIFICADO con Abarrotera
 * y Barbería (ver prompt "CORTE DIARIO FINAL" — reemplaza la versión
 * anterior de este wizard, que deliberadamente NO calculaba diferencia).
 *
 * Paso 1 (Corte): ventas de hoy calculadas, fondo inicial (opcional),
 * efectivo real (obligatorio) con la diferencia (efectivo - ventas) en
 * vivo debajo, y un gasto del día con concepto libre — SÍ se convierte en
 * un Expense real (a diferencia de la primera versión), así aparece en
 * Gastos/Ventas y resta de Ganancia. Se guarda en fondita_cortes, bitácora
 * write-only (mismo patrón que fondita_menu_dia): nada la lee todavía.
 *
 * Paso 2 (Merma) sí tiene efecto en vivo: "Sobró" (poco o mucho) mantiene
 * el platillo activo para mañana con el badge "SOBRANTE DE AYER" (ver
 * estadoMerma en Dish/Menú); "Se acabó"/"Se tiró" lo apaga. "Se tiró" con
 * monto SIEMPRE crea un Expense real — es una pérdida que el dueño está
 * reportando directamente, con o sin costo_opcional en el platillo; el
 * costo solo importa para la pestaña Ganancias (ver app/app/gastos/page.tsx),
 * no para si el gasto se registra o no.
 */
export function CerrarTurnoSheet({ open, onClose, session, update, hoyEnSuZona }: Props) {
  const [paso, setPaso] = React.useState<1 | 2>(1);
  const [fondoInicial, setFondoInicial] = React.useState("");
  const [efectivoReal, setEfectivoReal] = React.useState("");
  const [gastoMonto, setGastoMonto] = React.useState("");
  const [gastoConcepto, setGastoConcepto] = React.useState("");
  const [decisiones, setDecisiones] = React.useState<Record<string, { tipo: MermaTipo; monto?: string }>>({});
  const [guardando, setGuardando] = React.useState(false);

  const data = session.fonda!;
  const negocio = session.business;
  const esNegocioReal = Boolean(negocio.ownerId);

  const ventasHoy = data.pedidos
    .filter((p) => p.estado === "entregado" && p.fecha === hoyEnSuZona)
    .reduce((acc, p) => acc + p.total, 0);
  const ventasPorEmpleado = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of data.pedidos) {
      if (p.estado !== "entregado" || p.fecha !== hoyEnSuZona) continue;
      const nombre = p.empleadoNombreCache ?? "Dueño";
      mapa.set(nombre, (mapa.get(nombre) ?? 0) + p.total);
    }
    return Array.from(mapa, ([nombre, monto]) => ({ nombre, monto }));
  }, [data.pedidos, hoyEnSuZona]);

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

  // Lo que DEBERÍA haber en la caja: lo vendido, más lo que ya había de
  // fondo, menos lo que se gastó — no solo "efectivo vs ventas" (eso
  // ignoraba fondo inicial y gastos, mostrando faltantes reales como si
  // "sobrara" dinero).
  const fondoInicialNum = fondoInicial.trim() === "" ? 0 : Number(fondoInicial) || 0;
  const gastoNum = gastoMonto.trim() === "" ? 0 : Number(gastoMonto) || 0;
  const esperado = ventasHoy + fondoInicialNum - gastoNum;
  const efectivoValido = efectivoReal.trim() !== "" && !isNaN(Number(efectivoReal)) && Number(efectivoReal) >= 0;
  // Redondeado al peso entero: mismo criterio que mensajeDiferencia() (lib/mock.ts)
  // — así el color de arriba y el mensaje nunca se contradicen, y lo que se
  // guarda queda consistente con lo que vio el dueño.
  const diferencia = efectivoValido ? Math.round(Number(efectivoReal) - esperado) : null;

  function resetYCerrar() {
    setPaso(1);
    setFondoInicial("");
    setEfectivoReal("");
    setGastoMonto("");
    setGastoConcepto("");
    setDecisiones({});
    onClose();
  }

  async function guardarCorte() {
    if (!efectivoValido) return;
    const efectivoNum = Number(efectivoReal);
    const gastoNum = gastoMonto.trim() === "" ? null : Number(gastoMonto);

    if (gastoNum && gastoNum > 0) {
      const gasto: Expense = { id: uid("exp"), categoria: gastoConcepto.trim() || "Gasto del día", monto: gastoNum, fecha: hoyEnSuZona };
      update((prev) => {
        const f = prev.fonda!;
        return { ...prev, fonda: { ...f, gastos: [gasto, ...f.gastos] } };
      });
    }

    if (esNegocioReal) {
      const { error } = await supabase.from("fondita_cortes").insert({
        negocio_id: negocio.id,
        fecha: hoyEnSuZona,
        fondo_inicial: fondoInicial.trim() === "" ? null : Number(fondoInicial),
        ventas_calculadas: ventasHoy,
        efectivo_real: efectivoNum,
        gastos: gastoNum,
        diferencia: Math.round(efectivoNum - esperado),
        empleado_id: camposEmpleado().empleadoId ?? null,
        empleado_nombre_cache: camposEmpleado().empleadoNombreCache ?? null,
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

      if (decision.tipo === "tirado" && montoTirado && montoTirado > 0) {
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
        // "Se acabó" y "Se tiró" no dejan nada para mañana.
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
            <VentasPorEmpleado datos={ventasPorEmpleado} />
            <div className="space-y-1.5">
              <Label>Fondo inicial (opcional)</Label>
              <Input type="number" inputMode="decimal" value={fondoInicial} onChange={(e) => setFondoInicial(e.target.value)} placeholder="$0" />
            </div>
            <div className="space-y-1.5">
              <Label>¿Efectivo real en mano?</Label>
              <Input type="number" inputMode="decimal" autoFocus value={efectivoReal} onChange={(e) => setEfectivoReal(e.target.value)} placeholder="$0" />
              {diferencia != null && (
                <p
                  className={`px-1 text-xs font-medium ${
                    diferencia === 0 ? "text-ledger" : diferencia < 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {mensajeDiferencia(diferencia)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>¿Gastaste hoy?</Label>
              <Input type="number" inputMode="decimal" value={gastoMonto} onChange={(e) => setGastoMonto(e.target.value)} placeholder="$0" />
              {gastoMonto.trim() !== "" && Number(gastoMonto) > 0 && (
                <Input value={gastoConcepto} onChange={(e) => setGastoConcepto(e.target.value)} placeholder="Concepto (ej. gas, verdura)" />
              )}
            </div>
          </div>
          <SheetFooter>
            <Button size="lg" disabled={!efectivoValido} onClick={guardarCorte}>
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
                          placeholder="¿Cuánto se tiró? $"
                        />
                        {p.costo == null && (
                          <p className="text-xs text-muted-foreground">Agrega costo a este platillo para ver su pérdida real en Ganancias.</p>
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
