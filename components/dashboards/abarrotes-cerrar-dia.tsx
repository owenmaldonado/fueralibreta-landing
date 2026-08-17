"use client";

import * as React from "react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { VentasPorEmpleado } from "./ventas-por-empleado";
import { supabase } from "@/lib/supabase";
import { formatMoney, fechaCalendarioLocal, mensajeDiferencia, todayISO, uid } from "@/lib/mock";
import { camposEmpleado } from "@/lib/empleados";
import type { TenantData, SessionUpdater, Expense } from "@/lib/types";

type Accion = "vendido_todo" | "caduco" | "por_caducar";

const OPCIONES: { accion: Accion; label: string }[] = [
  { accion: "vendido_todo", label: "Se vendió todo ✅" },
  { accion: "caduco", label: "Caducó / Se rompió 🗑️" },
  { accion: "por_caducar", label: "Por caducar mañana" },
];

interface Decision {
  accion: Accion;
  cantidad?: string;
  perdida?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  session: TenantData;
  update: SessionUpdater;
}

/**
 * "Cerrar Día": wizard de 2 pasos para Abarrotera, mismo espíritu que
 * CerrarTurnoSheet de Fondita pero con las diferencias que le tocan al
 * giro: aquí SÍ se pide y muestra el faltante/sobrante (el dueño lo quiere
 * ver, a diferencia de Fondita), y el paso 2 es sobre caducidad/daño de
 * inventario en vez de sobre platillos del día.
 *
 * Paso 1 (Corte) guarda en abarrotera_cortes — bitácora write-only (mismo
 * patrón que fondita_cortes), directo a Supabase para negocios reales.
 * Esquema base UNIFICADO con Fondita/Barbería (prompt "CORTE DIARIO
 * FINAL"): fondo inicial opcional, efectivo real obligatorio, y el mismo
 * mensaje de diferencia (efectivo - ventas) con emoji.
 *
 * Paso 2 (Caducados) solo lista productos con stock < 3 o vendidos hoy.
 * "Caducó/Se rompió" con cantidad y pérdida en $ se refleja además como un
 * abarrotes_gastos real (ya fluye a Gastos/Ventas por el sync existente) y
 * descuenta esas piezas del stock. "Por caducar mañana" deja el badge
 * amarillo en Hoy (GroceryProduct.porCaducar) hasta que un próximo cierre
 * lo resuelva. Cada decisión se registra también en abarrotera_mermas.
 */
export function CerrarDiaSheet({ open, onClose, session, update }: Props) {
  const [paso, setPaso] = React.useState<1 | 2>(1);
  const [fondoInicial, setFondoInicial] = React.useState("");
  const [efectivoReal, setEfectivoReal] = React.useState("");
  const [gastoMonto, setGastoMonto] = React.useState("");
  const [gastoConcepto, setGastoConcepto] = React.useState("");
  const [decisiones, setDecisiones] = React.useState<Record<string, Decision>>({});
  const [guardando, setGuardando] = React.useState(false);

  const data = session.abarrotes!;
  const negocio = session.business;
  const esNegocioReal = Boolean(negocio.ownerId);
  const hoy = todayISO(0);

  const ventasHoyList = data.ventas.filter((v) => !v.cancelada && fechaCalendarioLocal(v.fecha) === hoy);
  const ventasHoyTotal = ventasHoyList.reduce((acc, v) => acc + v.total, 0);
  const ventasPorEmpleado = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of ventasHoyList) {
      const nombre = v.empleadoNombreCache ?? "Dueño";
      mapa.set(nombre, (mapa.get(nombre) ?? 0) + v.total);
    }
    return Array.from(mapa, ([nombre, monto]) => ({ nombre, monto }));
  }, [ventasHoyList]);
  const vendidosPorProducto = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of ventasHoyList) {
      for (const it of v.items) {
        mapa.set(it.productoId, (mapa.get(it.productoId) ?? 0) + it.cantidad);
      }
    }
    return mapa;
  }, [ventasHoyList]);

  const productosRelevantes = data.productos.filter((p) => !p.isVolatile && (p.stock < 3 || vendidosPorProducto.has(p.id)));

  // Lo que DEBERÍA haber en la caja: lo vendido, más lo que ya había de
  // fondo, menos lo que se gastó — no solo "efectivo vs ventas" (eso
  // ignoraba fondo inicial y gastos, mostrando faltantes reales como si
  // "sobrara" dinero).
  const fondoInicialNum = fondoInicial.trim() === "" ? 0 : Number(fondoInicial) || 0;
  const gastoNum = gastoMonto.trim() === "" ? 0 : Number(gastoMonto) || 0;
  const esperado = ventasHoyTotal + fondoInicialNum - gastoNum;
  const efectivoValido = efectivoReal.trim() !== "" && !isNaN(Number(efectivoReal)) && Number(efectivoReal) >= 0;
  const diferencia = efectivoValido ? Number(efectivoReal) - esperado : null;

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
    if (esNegocioReal) {
      const { error } = await supabase.from("abarrotera_cortes").insert({
        negocio_id: negocio.id,
        fecha: hoy,
        fondo_inicial: fondoInicial.trim() === "" ? null : Number(fondoInicial),
        ventas_calculadas: ventasHoyTotal,
        efectivo_real: efectivoNum,
        gastos: gastoMonto.trim() === "" ? null : Number(gastoMonto),
        diferencia: efectivoNum - esperado,
        empleado_id: camposEmpleado().empleadoId ?? null,
        empleado_nombre_cache: camposEmpleado().empleadoNombreCache ?? null,
      });
      if (error) console.error("No se pudo guardar el corte:", error);
    }
    if (gastoMonto.trim() !== "" && Number(gastoMonto) > 0) {
      const gasto: Expense = {
        id: uid("exp"),
        categoria: gastoConcepto.trim() || "Gasto del día",
        monto: Number(gastoMonto),
        fecha: hoy,
      };
      update((prev) => {
        const a = prev.abarrotes!;
        return { ...prev, abarrotes: { ...a, gastos: [gasto, ...a.gastos] } };
      });
    }
    setPaso(2);
  }

  function elegir(productoId: string, accion: Accion) {
    setDecisiones((prev) => ({ ...prev, [productoId]: { accion, cantidad: prev[productoId]?.cantidad, perdida: prev[productoId]?.perdida } }));
  }

  function setCampo(productoId: string, campo: "cantidad" | "perdida", valor: string) {
    setDecisiones((prev) => ({ ...prev, [productoId]: { ...prev[productoId], accion: "caduco", [campo]: valor } }));
  }

  async function terminarCierre() {
    setGuardando(true);
    const mermaRows: Record<string, unknown>[] = [];
    const nuevosGastos: Expense[] = [];

    for (const p of productosRelevantes) {
      const decision = decisiones[p.id];
      if (!decision) continue;
      const cantidad = decision.accion === "caduco" && decision.cantidad ? Number(decision.cantidad) : undefined;
      const perdida = decision.accion === "caduco" && decision.perdida ? Number(decision.perdida) : undefined;

      mermaRows.push({
        negocio_id: negocio.id,
        fecha: hoy,
        producto_id: p.id,
        producto_nombre: p.nombre,
        accion: decision.accion,
        cantidad: cantidad ?? null,
        perdida_dinero: perdida ?? null,
      });

      if (decision.accion === "caduco" && cantidad && cantidad > 0 && perdida && perdida > 0) {
        nuevosGastos.push({ id: uid("exp"), categoria: `Merma: ${p.nombre} x${cantidad}`, monto: perdida, fecha: hoy });
      }
    }

    if (esNegocioReal && mermaRows.length > 0) {
      const { error } = await supabase.from("abarrotera_mermas").insert(mermaRows);
      if (error) console.error("No se pudieron guardar las mermas:", error);
    }

    update((prev) => {
      const a = prev.abarrotes!;
      const productos = a.productos.map((p) => {
        const decision = decisiones[p.id];
        if (!decision) return p;
        if (decision.accion === "por_caducar") {
          return { ...p, porCaducar: true };
        }
        const cantidad = decision.accion === "caduco" && decision.cantidad ? Number(decision.cantidad) : 0;
        return { ...p, porCaducar: false, stock: cantidad > 0 ? Math.max(0, p.stock - cantidad) : p.stock };
      });
      const gastos = nuevosGastos.length > 0 ? [...nuevosGastos, ...a.gastos] : a.gastos;
      return { ...prev, abarrotes: { ...a, productos, gastos } };
    });

    setGuardando(false);
    resetYCerrar();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && resetYCerrar()}>
      {paso === 1 ? (
        <>
          <SheetHeader title="Cerrar día" description="Paso 1 de 2 · Corte" onClose={resetYCerrar} />
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ventas de hoy (calculadas)</p>
              <p className="font-display text-2xl font-bold text-ledger">{formatMoney(ventasHoyTotal)}</p>
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
                <Input value={gastoConcepto} onChange={(e) => setGastoConcepto(e.target.value)} placeholder="Concepto (ej. reposición)" />
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
          <SheetHeader title="Cerrar día" description="Paso 2 de 2 · Caducados / Dañados" onClose={resetYCerrar} />
          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
            {productosRelevantes.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">Nada con stock bajo ni vendido hoy.</p>
            ) : (
              productosRelevantes.map((p) => {
                const decision = decisiones[p.id];
                const vendidos = vendidosPorProducto.get(p.id) ?? 0;
                return (
                  <div key={p.id} className="rounded-xl border border-border bg-card p-3">
                    <p className="text-sm font-semibold">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      Vendiste {vendidos} · Quedan {p.stock}
                    </p>
                    <ChipGroup className="mt-2">
                      {OPCIONES.map((op) => (
                        <Chip key={op.accion} selected={decision?.accion === op.accion} onClick={() => elegir(p.id, op.accion)}>
                          {op.label}
                        </Chip>
                      ))}
                    </ChipGroup>
                    {decision?.accion === "caduco" && (
                      <div className="mt-2 flex gap-2">
                        <Input
                          type="number"
                          inputMode="numeric"
                          autoFocus
                          value={decision.cantidad ?? ""}
                          onChange={(e) => setCampo(p.id, "cantidad", e.target.value)}
                          placeholder="¿Cuántas piezas?"
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={decision.perdida ?? ""}
                          onChange={(e) => setCampo(p.id, "perdida", e.target.value)}
                          placeholder={`¿Cuánto perdiste? $${
                            decision.cantidad ? ` (sugerido ${formatMoney((Number(decision.cantidad) || 0) * p.costo)})` : ""
                          }`}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <SheetFooter>
            <Button size="lg" disabled={guardando} onClick={terminarCierre}>
              Terminar cierre
            </Button>
          </SheetFooter>
        </>
      )}
    </Sheet>
  );
}
