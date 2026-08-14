"use client";

import * as React from "react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import { formatMoney, todayISO, uid } from "@/lib/mock";
import type { TenantData, SessionUpdater, CajaEntry } from "@/lib/types";

const MATERIALES = ["Gel", "Navajas", "Cera"];

interface Resumen {
  ventas: number;
  propinas: number;
  gastos: number;
  ganancia: number;
  gastoConceptos: { concepto: string; monto: number }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  session: TenantData;
  update: SessionUpdater;
}

/**
 * "Cerrar Turno" de Barbería: wizard de 2 pasos + una pantalla de resumen.
 *
 * Paso 1 (Corte) muestra las ventas de hoy (suma de citas "listo" de hoy) y
 * las citas atendidas, pide efectivo real y calcula el faltante/sobrante en
 * vivo — igual que Abarrotera (a diferencia de Fondita, que deliberadamente
 * no lo calcula).
 *
 * Paso 2 (Propinas y material) es lo que de verdad le importa al barbero:
 * un total de propinas del día y un checklist rápido de gastos de material.
 * Las propinas y cada gasto de material se guardan como CajaEntry reales
 * (mismo tipo/tabla que "Nuevo movimiento" en Caja) — ya fluyen a la
 * gráfica de Caja por el sync existente, sin tocarla. Las propinas NO
 * restan de la ganancia del resumen (son informativas); la ganancia
 * mostrada es ventas - gastos de material del día, calculada aquí mismo
 * para el resumen — no cambia la "Ganancia neta" de Caja (que es un
 * acumulado del periodo con su propia definición, ya establecida).
 *
 * barberia_cortes es bitácora write-only (mismo patrón que fondita_cortes
 * y abarrotera_cortes): se escribe directo a Supabase solo para negocios
 * reales al terminar el cierre, con todo ya resuelto (ventas, efectivo,
 * propinas, gastos de material y faltante); nada la lee todavía.
 */
export function CerrarTurnoSheet({ open, onClose, session, update }: Props) {
  const [paso, setPaso] = React.useState<1 | 2 | "resumen">(1);
  const [efectivoReal, setEfectivoReal] = React.useState("");
  const [propinas, setPropinas] = React.useState("");
  const [materiales, setMateriales] = React.useState<Record<string, string>>({});
  const [otroChecked, setOtroChecked] = React.useState(false);
  const [otroConcepto, setOtroConcepto] = React.useState("");
  const [otroMonto, setOtroMonto] = React.useState("");
  const [resumen, setResumen] = React.useState<Resumen | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const data = session.barberia!;
  const negocio = session.business;
  const esNegocioReal = Boolean(negocio.ownerId);
  const hoy = todayISO(0);

  const citasHoyListo = data.citas.filter((c) => c.fecha === hoy && c.estado === "listo");
  const ventasHoyTotal = citasHoyListo.reduce((acc, c) => acc + c.precio, 0);
  const citasAtendidas = citasHoyListo.length;

  const faltante = efectivoReal.trim() === "" ? null : Number(efectivoReal) - ventasHoyTotal;

  function resetYCerrar() {
    setPaso(1);
    setEfectivoReal("");
    setPropinas("");
    setMateriales({});
    setOtroChecked(false);
    setOtroConcepto("");
    setOtroMonto("");
    setResumen(null);
    onClose();
  }

  function toggleMaterial(nombre: string) {
    setMateriales((prev) => {
      const next = { ...prev };
      if (nombre in next) delete next[nombre];
      else next[nombre] = "";
      return next;
    });
  }

  async function terminarCierre() {
    setGuardando(true);
    const propinasNum = Number(propinas) || 0;

    const gastoConceptos: { concepto: string; monto: number }[] = [];
    for (const nombre of MATERIALES) {
      if (nombre in materiales) {
        const monto = Number(materiales[nombre]) || 0;
        if (monto > 0) gastoConceptos.push({ concepto: nombre, monto });
      }
    }
    if (otroChecked) {
      const monto = Number(otroMonto) || 0;
      if (monto > 0) gastoConceptos.push({ concepto: otroConcepto.trim() || "Otro material", monto });
    }
    const gastosMaterialTotal = gastoConceptos.reduce((acc, g) => acc + g.monto, 0);

    const nowISO = new Date().toISOString();
    const nuevasEntradas: CajaEntry[] = [];
    if (propinasNum > 0) {
      nuevasEntradas.push({ id: uid("caja"), tipo: "propina", concepto: "Propinas del día", monto: propinasNum, metodo: "efectivo", fecha: nowISO });
    }
    for (const g of gastoConceptos) {
      nuevasEntradas.push({ id: uid("caja"), tipo: "gasto", concepto: `Material: ${g.concepto}`, monto: g.monto, metodo: "efectivo", fecha: nowISO });
    }
    if (nuevasEntradas.length > 0) {
      update((prev) => {
        const b = prev.barberia!;
        return { ...prev, barberia: { ...b, caja: [...nuevasEntradas, ...b.caja] } };
      });
    }

    if (esNegocioReal) {
      const efectivoNum = efectivoReal.trim() === "" ? null : Number(efectivoReal);
      const { error } = await supabase.from("barberia_cortes").insert({
        negocio_id: negocio.id,
        fecha: hoy,
        ventas_calculadas: ventasHoyTotal,
        efectivo_real: efectivoNum,
        propinas_total: propinasNum,
        gastos_material: gastosMaterialTotal,
        faltante: efectivoNum == null ? null : efectivoNum - ventasHoyTotal,
      });
      if (error) console.error("No se pudo guardar el corte:", error);
    }

    setResumen({
      ventas: ventasHoyTotal,
      propinas: propinasNum,
      gastos: gastosMaterialTotal,
      ganancia: ventasHoyTotal - gastosMaterialTotal,
      gastoConceptos,
    });
    setGuardando(false);
    setPaso("resumen");
  }

  function textoResumen(r: Resumen): string {
    const partes = [`Hoy hiciste ${formatMoney(r.ventas)}`];
    if (r.propinas > 0) partes.push(`propinas ${formatMoney(r.propinas)}`);
    if (r.gastoConceptos.length > 0) {
      partes.push(`gastaste ${r.gastoConceptos.map((g) => `${formatMoney(g.monto)} en ${g.concepto.toLowerCase()}`).join(", ")}`);
    }
    partes.push(`ganancia ${formatMoney(r.ganancia)}`);
    return `${partes.join(", ")}.`;
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && resetYCerrar()}>
      {paso === 1 ? (
        <>
          <SheetHeader title="Cerrar turno" description="Paso 1 de 2 · Corte" onClose={resetYCerrar} />
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ventas de hoy (calculadas)</p>
              <p className="font-display text-2xl font-bold text-ledger">{formatMoney(ventasHoyTotal)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Citas atendidas: {citasAtendidas}</p>
            </div>
            <div className="space-y-1.5">
              <Label>¿Efectivo real en mano?</Label>
              <Input
                type="number"
                inputMode="decimal"
                autoFocus
                className="h-14 text-lg"
                value={efectivoReal}
                onChange={(e) => setEfectivoReal(e.target.value)}
                placeholder="$0"
              />
              {faltante != null && (
                <p className="px-1 text-xs text-muted-foreground">
                  {faltante < 0
                    ? `Faltante: ${formatMoney(-faltante)}`
                    : faltante > 0
                      ? `Sobrante: ${formatMoney(faltante)}`
                      : "Cuadra exacto ✅"}
                </p>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button size="lg" onClick={() => setPaso(2)}>
              Continuar
            </Button>
          </SheetFooter>
        </>
      ) : paso === 2 ? (
        <>
          <SheetHeader title="Cerrar turno" description="Paso 2 de 2 · Propinas y material" onClose={resetYCerrar} />
          <div className="flex flex-col gap-5">
            <div className="space-y-1.5">
              <Label>¿Cuánto fue de propinas hoy?</Label>
              <Input type="number" inputMode="decimal" value={propinas} onChange={(e) => setPropinas(e.target.value)} placeholder="$0" />
            </div>
            <div className="space-y-2">
              <Label>¿Gastaste en material hoy?</Label>
              <div className="flex flex-col gap-2">
                {MATERIALES.map((nombre) => (
                  <div key={nombre} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                    <Checkbox checked={nombre in materiales} onCheckedChange={() => toggleMaterial(nombre)} />
                    <span className="flex-1 text-sm font-medium">{nombre}</span>
                    {nombre in materiales && (
                      <Input
                        type="number"
                        inputMode="decimal"
                        autoFocus
                        className="w-24"
                        value={materiales[nombre]}
                        onChange={(e) => setMateriales((prev) => ({ ...prev, [nombre]: e.target.value }))}
                        placeholder="$0"
                      />
                    )}
                  </div>
                ))}
                <div className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={otroChecked} onCheckedChange={setOtroChecked} />
                    <span className="flex-1 text-sm font-medium">Otro</span>
                    {otroChecked && (
                      <Input type="number" inputMode="decimal" className="w-24" value={otroMonto} onChange={(e) => setOtroMonto(e.target.value)} placeholder="$0" />
                    )}
                  </div>
                  {otroChecked && (
                    <Input
                      className="mt-2"
                      value={otroConcepto}
                      onChange={(e) => setOtroConcepto(e.target.value)}
                      placeholder="Concepto (ej. tijeras nuevas)"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button size="lg" disabled={guardando} onClick={terminarCierre}>
              Terminar cierre
            </Button>
          </SheetFooter>
        </>
      ) : (
        resumen && (
          <>
            <SheetHeader title="¡Turno cerrado!" onClose={resetYCerrar} />
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm leading-relaxed">{textoResumen(resumen)}</p>
            </div>
            <SheetFooter>
              <Button size="lg" onClick={resetYCerrar}>
                Listo
              </Button>
            </SheetFooter>
          </>
        )
      )}
    </Sheet>
  );
}
