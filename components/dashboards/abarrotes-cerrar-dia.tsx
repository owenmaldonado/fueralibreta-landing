"use client";

import * as React from "react";
import { toast } from "sonner";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { VentasPorEmpleado } from "./ventas-por-empleado";
import { insertGastoDirecto, cleanInsert } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { useOnlineStatus } from "@/lib/use-online-status";
import { CierreBloqueado } from "./cierre-bloqueado";
import { enTurnoActual, desdeCuandoCuenta } from "@/lib/turno";
import { formatMoney, formatMoneyExacto, fechaCalendarioLocal, redondear2, uid } from "@/lib/mock";
import { MensajeCorte } from "./mensaje-corte";
import { DesgloseCorte, type RenglonCorte } from "./desglose-corte";
import { hoyEnZona } from "@/lib/fecha";
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
  /** Se dispara SOLO cuando terminarCierre() llega al final de verdad (día cerrado) — nunca si se cancela en Paso 1/2. Mismo propósito que en barberia-cerrar-turno.tsx: TopBar lo usa para, en modo vendedor, recién ahí pedir el PIN de dueño y volver al panel. */
  onCompletado?: () => void;
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
export function CerrarDiaSheet({ open, onClose, session, update, onCompletado }: Props) {
  const [paso, setPaso] = React.useState<1 | 2>(1);
  const [fondoInicial, setFondoInicial] = React.useState("");
  const [efectivoReal, setEfectivoReal] = React.useState("");
  const [gastoMonto, setGastoMonto] = React.useState("");
  const [gastoConcepto, setGastoConcepto] = React.useState("");
  const [decisiones, setDecisiones] = React.useState<Record<string, Decision>>({});
  const [guardando, setGuardando] = React.useState(false);
  const [yaFueCerrado, setYaFueCerrado] = React.useState(false);

  const data = session.abarrotes!;
  const negocio = session.business;
  const esNegocioReal = Boolean(negocio.ownerId);
  // "Hoy" del negocio, no del dispositivo — ver lib/fecha.ts.
  const hoy = hoyEnZona(negocio.timezone);
  const online = useOnlineStatus();
  const sinConexion = !online && esNegocioReal;

  // Abarrotera cierra por DÍA (a diferencia de la fonda, que cierra por
  // turno): un segundo cierre el mismo día volvería a contar las mismas
  // ventas y a duplicar el gasto del corte. Ojo con el nombre de la tabla:
  // es abarroteRA_cortes, no abarrotes_cortes — consultar la equivocada
  // devuelve vacío siempre y el bloqueo nunca se activaría.
  React.useEffect(() => {
    if (!open || !esNegocioReal || !online) return;
    let cancelado = false;
    (async () => {
      try {
        const { data: cortes } = await supabase
          .from("abarrotera_cortes")
          .select("id")
          .eq("negocio_id", negocio.id)
          .eq("fecha", hoy)
          .limit(1);
        if (!cancelado) setYaFueCerrado((cortes?.length ?? 0) > 0);
      } catch (err) {
        console.error("No se pudo verificar si el día ya fue cerrado:", err);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open, esNegocioReal, online, negocio.id, hoy]);

  // DESDE EL ÚLTIMO CIERRE, no "todo el día" — misma corrección que en
  // barbería (ver lib/turno.ts). abarrotes_ventas.fecha es un instante real,
  // así que se compara directo contra el momento del cierre.
  const ventasHoyList = data.ventas.filter(
    (v) => !v.cancelada && enTurnoActual({ creadoEn: v.fecha, fecha: fechaCalendarioLocal(v.fecha, negocio.timezone) }, negocio, hoy)
  );
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
  // "sobrara" dinero). "Lo que se gastó" antes SOLO era el campo de este
  // mismo paso — cualquier gasto registrado hoy desde Gastos/Ventas (por
  // cualquier empleado) no se restaba, así que el corte podía decir que
  // sobraba dinero que en realidad ya se había gastado en otro lado.
  // Los gastos SOLO guardan el día (no la hora), así que no se pueden partir
  // entre dos turnos del mismo día. Se quedan por día a propósito: partirlos
  // mal sería peor que contarlos completos, y el dueño los ve desglosados en
  // /app/cortes. Es justo lo que Owen reportó como "las ventas inician en 0
  // pero siguen ahí los mismos gastos" — es real, y esta es la razón.
  const gastosHoyDelDia = data.gastos.filter((g) => fechaCalendarioLocal(g.fecha, negocio.timezone) === hoy);
  const fondoInicialNum = fondoInicial.trim() === "" ? 0 : Number(fondoInicial) || 0;
  const gastoNum = gastoMonto.trim() === "" ? 0 : Number(gastoMonto) || 0;
  const gastosHoyDelDiaTotal = gastosHoyDelDia.reduce((acc, g) => acc + g.monto, 0);
  const esperado = redondear2(ventasHoyTotal + fondoInicialNum - gastoNum - gastosHoyDelDiaTotal);

  // Los mismos sumandos del renglón de arriba, pero uno por uno para que el
  // dueño pueda auditar de dónde sale el total. Si el orden o los signos de
  // aquí no coinciden con `esperado`, la pantalla estaría mintiendo — por eso
  // se arman a partir de las MISMAS variables, no de un cálculo aparte.
  const renglonesCorte: RenglonCorte[] = [
    { concepto: "Vendido", monto: ventasHoyTotal, tipo: "suma" },
    { concepto: "Fondo inicial", monto: fondoInicialNum, tipo: "suma" },
    { concepto: "Gastos ya registrados hoy", monto: gastosHoyDelDiaTotal, tipo: "resta" },
    { concepto: "Gasto que estás capturando", monto: gastoNum, tipo: "resta" },
  ];
  const efectivoValido = efectivoReal.trim() !== "" && !isNaN(Number(efectivoReal)) && Number(efectivoReal) >= 0;
  // Redondeado al peso entero: mismo criterio que mensajeDiferencia() (lib/mock.ts)
  // — así el color de arriba y el mensaje nunca se contradicen, y lo que se
  // guarda en abarrotera_cortes.diferencia coincide con lo que vio el dueño.
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
    if (esNegocioReal) {
      try {
        await cleanInsert("abarrotera_cortes", [
          {
            negocio_id: negocio.id,
            fecha: hoy,
            fondo_inicial: fondoInicial.trim() === "" ? null : Number(fondoInicial),
            ventas_calculadas: ventasHoyTotal,
            efectivo_real: efectivoNum,
            gastos: gastoMonto.trim() === "" ? null : Number(gastoMonto),
            diferencia: Math.round(efectivoNum - esperado),
            empleado_id: camposEmpleado().empleadoId ?? null,
            empleado_nombre_cache: camposEmpleado().empleadoNombreCache ?? null,
            // El ROL, no solo el nombre: sin él, el reporte de cierres del
            // dueño (/app/cortes) pinta "Dueño" en el cierre que hizo su
            // vendedor — EmpleadoBadge trata "sin rol" como dueño. Sería
            // justo lo contrario de para lo que sirve ese reporte.
            empleado_rol_cache: camposEmpleado().empleadoRolCache ?? null,
          },
        ]);
      } catch (error) {
        console.error("No se pudo guardar el corte:", error);
      }
    }
    if (gastoMonto.trim() !== "" && Number(gastoMonto) > 0) {
      const gasto: Expense = {
        id: uid("exp"),
        categoria: gastoConcepto.trim() || "Gasto del día",
        monto: Number(gastoMonto),
        fecha: hoy,
        ...camposEmpleado(),
      };

      // Dinero real: se espera la confirmación de Supabase antes de
      // tocar el estado local (mismo criterio que app/app/gastos/page.tsx).
      if (esNegocioReal) {
        setGuardando(true);
        try {
          await insertGastoDirecto(negocio.id, "abarrotes", [gasto]);
        } catch {
          toast.error("No se pudo guardar el gasto del día — revisa tu conexión e intenta de nuevo.");
          setGuardando(false);
          return;
        }
        setGuardando(false);
      }

      update((prev) => {
        const a = prev.abarrotes!;
        return { ...prev, abarrotes: { ...a, gastos: [gasto, ...a.gastos] } };
      }, { yaSincronizado: true });
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
        nuevosGastos.push({ id: uid("exp"), categoria: `Merma: ${p.nombre} x${cantidad}`, monto: perdida, fecha: hoy, ...camposEmpleado() });
      }
    }

    if (esNegocioReal && mermaRows.length > 0) {
      try {
        await cleanInsert("abarrotera_mermas", mermaRows);
      } catch (error) {
        console.error("No se pudieron guardar las mermas:", error);
      }
    }

    // La merma "caducó/se rompió" con pérdida en $ es dinero real, así que
    // se inserta y se confirma ANTES de tocar el estado local — mismo
    // criterio que guardarCorte() arriba.
    if (esNegocioReal && nuevosGastos.length > 0) {
      try {
        await insertGastoDirecto(negocio.id, "abarrotes", nuevosGastos);
      } catch {
        toast.error("No se pudo guardar la merma como gasto — revisa tu conexión e intenta de nuevo.");
        setGuardando(false);
        return;
      }
    }

    // Dos update() separados a propósito: el de productos (stock/porCaducar)
    // es un cambio normal que syncTenantDiff debe subir como siempre; el de
    // gastos ya se insertó a mano arriba, así que va con yaSincronizado
    // para no duplicarlo (ver nota en lib/session.ts).
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
      return { ...prev, abarrotes: { ...a, productos } };
    });

    if (nuevosGastos.length > 0) {
      update((prev) => {
        const a = prev.abarrotes!;
        return { ...prev, abarrotes: { ...a, gastos: [...nuevosGastos, ...a.gastos] } };
      }, { yaSincronizado: true });
    }

    // Marca el momento del cierre en `negocios`: es lo que hace que el
    // SIGUIENTE corte arranque en cero, en todos los dispositivos a la vez
    // (esa tabla ya tiene canal de realtime). Sin esto, abarrotera volvía a
    // contar todo el día en el segundo cierre — ver lib/turno.ts y la
    // migración 20260918000000.
    update((prev) => ({ ...prev, business: { ...prev.business, turnoCerradoEn: new Date().toISOString() } }));

    setGuardando(false);
    resetYCerrar();
    onCompletado?.();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && resetYCerrar()}>
      {sinConexion ? (
        <CierreBloqueado motivo="sin-conexion" titulo="Sin conexión" queEs="día" onClose={resetYCerrar} />
      ) : yaFueCerrado ? (
        <CierreBloqueado motivo="ya-cerrado" titulo="Día cerrado" queEs="día" onClose={resetYCerrar} onContinuar={() => setYaFueCerrado(false)} />
      ) : paso === 1 ? (
        <>
          <SheetHeader title="Cerrar día" description="Paso 1 de 2 · Corte" onClose={resetYCerrar} />
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ventas de hoy (calculadas)</p>
              <p className="font-display text-2xl font-bold text-ledger">{formatMoneyExacto(ventasHoyTotal)}</p>
            </div>
            <VentasPorEmpleado datos={ventasPorEmpleado} />
            {gastosHoyDelDia.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Gastos de hoy (ya registrados, se restan de lo que deberías tener)
                </p>
                {gastosHoyDelDia.map((g) => (
                  <div key={g.id} className="flex items-center justify-between text-sm">
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {g.categoria}
                      {g.empleadoNombreCache && <span className="ml-1 text-xs text-muted-foreground">({g.empleadoNombreCache})</span>}
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground">-{formatMoneyExacto(g.monto)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Fondo inicial (opcional)</Label>
              <Input type="number" inputMode="decimal" value={fondoInicial} onChange={(e) => setFondoInicial(e.target.value)} placeholder="$0" />
            </div>
            <div className="space-y-1.5">
              <Label>¿Efectivo real en mano?</Label>
              <Input type="number" inputMode="decimal" autoFocus value={efectivoReal} onChange={(e) => setEfectivoReal(e.target.value)} placeholder="$0" />
              <DesgloseCorte renglones={renglonesCorte} esperado={esperado} desdeCuando={desdeCuandoCuenta(negocio, negocio.timezone)} />
              <MensajeCorte diferencia={diferencia} esperado={esperado} />
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
            <Button size="lg" disabled={!efectivoValido || guardando} onClick={guardarCorte}>
              {guardando ? "Guardando..." : "Continuar a Merma"}
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
