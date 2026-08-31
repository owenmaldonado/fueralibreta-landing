"use client";

import * as React from "react";

import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { VentasPorEmpleado } from "./ventas-por-empleado";
import { supabase } from "@/lib/supabase";
import { cleanInsert } from "@/lib/data";
import { useOnlineStatus } from "@/lib/use-online-status";
import { CierreBloqueado } from "./cierre-bloqueado";
import { enTurnoActual, enTurnoActualPorDiaYHora, desdeCuandoCuenta } from "@/lib/turno";
import { formatMoney, formatMoneyExacto, fechaCalendarioLocal, redondear2, uid } from "@/lib/mock";
import { MensajeCorte } from "./mensaje-corte";
import { DesgloseCorte, type RenglonCorte } from "./desglose-corte";
import { hoyEnZona } from "@/lib/fecha";
import { camposEmpleado, permisosActuales } from "@/lib/empleados";
import type { TenantData, SessionUpdater, CajaEntry, InventoryProduct } from "@/lib/types";

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
  /** Se dispara SOLO cuando el wizard llegó de verdad a "¡Turno cerrado!" y se cerró desde ahí — nunca si se cancela en Paso 1/2. TopBar lo usa para, en modo vendedor, recién ahí pedir el PIN de dueño y volver al panel — ver components/app-shell/top-bar.tsx. */
  onCompletado?: () => void;
}

/** Nombre de producto de Inventario "parecido" al del checkbox de material — coincidencia simple por substring, sin acentos/mayúsculas, suficiente para "Navajas" -> "Navajas de afeitar". */
function buscarProductoSimilar(nombre: string, productos: InventoryProduct[]): InventoryProduct | undefined {
  const n = nombre.toLowerCase();
  return productos.find((p) => p.nombre.toLowerCase().includes(n) || n.includes(p.nombre.toLowerCase()));
}

/**
 * "Cerrar Turno" de Barbería: wizard de 2 pasos + una pantalla de resumen.
 * Esquema base UNIFICADO con Fondita/Abarrotera (prompt "CORTE DIARIO
 * FINAL"): fondo inicial opcional, efectivo real obligatorio, mensaje de
 * diferencia con emoji, y un gasto genérico del día con concepto — SÍ se
 * guarda como CajaEntry real, además del checklist de material del paso 2.
 *
 * Paso 1 (Corte) muestra las ventas de hoy (suma de citas "listo" de hoy) y
 * las citas atendidas.
 *
 * Paso 2 (Propinas y material) es lo que de verdad le importa al barbero:
 * un total de propinas del día y un checklist rápido de gastos de material.
 * Si el nombre del material coincide con un producto de Inventario
 * (barberia_productos), se le descuenta 1 de stock — si no existe ese
 * producto, el gasto se registra igual, solo sin tocar stock. Las propinas
 * y cada gasto (el genérico del paso 1 y los de material) se guardan como
 * CajaEntry reales (mismo tipo/tabla que "Nuevo movimiento" en Caja) — ya
 * fluyen a la gráfica de Caja por el sync existente, sin tocarla. Las
 * propinas NO restan de la ganancia del resumen (son informativas); la
 * ganancia mostrada es ventas - gastos del día, calculada aquí mismo para
 * el resumen — no cambia la "Ganancia neta" de Caja (que es un acumulado
 * del periodo con su propia definición, ya establecida).
 *
 * barberia_cortes es bitácora write-only (mismo patrón que fondita_cortes
 * y abarrotera_cortes): se escribe directo a Supabase solo para negocios
 * reales al terminar el cierre, con todo ya resuelto; nada la lee todavía.
 */
export function CerrarTurnoSheet({ open, onClose, session, update, onCompletado }: Props) {
  const [paso, setPaso] = React.useState<1 | 2 | "resumen">(1);
  const [fondoInicial, setFondoInicial] = React.useState("");
  const [efectivoReal, setEfectivoReal] = React.useState("");
  const [gastoMonto, setGastoMonto] = React.useState("");
  const [gastoConcepto, setGastoConcepto] = React.useState("");
  const [propinas, setPropinas] = React.useState("");
  // permisosActuales() lee una cookie: se resuelve en un efecto para no
  // desalinear el render del servidor con el del cliente. Arranca en false
  // (tapado) a propósito — si va a cambiar, que sea a destapado y no al
  // revés, para no alcanzar a enseñar la ganancia a quien no debe verla.
  const [puedeVerCorte, setPuedeVerCorte] = React.useState(false);

  React.useEffect(() => {
    setPuedeVerCorte(permisosActuales().verCorteDelDia);
  }, []);
  const [materiales, setMateriales] = React.useState<Record<string, string>>({});
  const [otroChecked, setOtroChecked] = React.useState(false);
  const [otroConcepto, setOtroConcepto] = React.useState("");
  const [otroMonto, setOtroMonto] = React.useState("");
  const [resumen, setResumen] = React.useState<Resumen | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [yaFueCerrado, setYaFueCerrado] = React.useState(false);
  const online = useOnlineStatus();

  const data = session.barberia!;
  const negocio = session.business;
  const esNegocioReal = Boolean(negocio.ownerId);
  // "Hoy" del negocio (zona configurada), no del dispositivo — ver
  // comentario en barberia-dashboard.tsx.
  const hoy = hoyEnZona(negocio.timezone);
  // El modo demo no escribe nada a Supabase, así que ahí el cierre sí puede
  // correr sin señal (mismo criterio que el guardia de update()).
  const sinConexion = !online && esNegocioReal;

  // Verificar si ya fue cerrado hoy. El builder de supabase-js es un
  // PromiseLike (solo .then), no una Promise — encadenarle .catch() no
  // compila; de ahí el try/catch dentro de un async.
  React.useEffect(() => {
    if (!open || !esNegocioReal) return;
    let cancelado = false;
    (async () => {
      try {
        const { data: cortes } = await supabase
          .from("barberia_cortes")
          .select("id")
          .eq("negocio_id", negocio.id)
          .eq("fecha", hoy)
          .limit(1);
        if (!cancelado) setYaFueCerrado((cortes?.length ?? 0) > 0);
      } catch (err) {
        console.error("No se pudo verificar si ya fue cerrado:", err);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open, esNegocioReal, negocio.id, hoy]);

  // DESDE EL ÚLTIMO CIERRE, no "todo el día".
  //
  // Antes esto era `c.fecha === hoy`: el segundo turno del día volvía a
  // contar lo del primero, y el vendedor de la tarde terminaba cuadrando
  // dinero que el de la mañana ya había entregado. Ver lib/turno.ts.
  const citasHoyListo = data.citas.filter(
    (c) => c.estado === "listo" && enTurnoActualPorDiaYHora(c, negocio, hoy)
  );
  // El corte solo sumaba citas — cualquier "Nueva venta"/"Nuevo gasto"
  // manual (Caja > Nuevo, o el FAB de Caja) hecho por CUALQUIER empleado
  // hoy quedaba fuera de "Ventas de hoy"/esperado, aunque sí aparecía en
  // la gráfica real de Caja: un vendedor podía cobrar una venta manual y
  // registrar un gasto y el corte del día ni se enteraba. fechaCalendarioLocal
  // (no comparar el ISO crudo) porque CajaEntry.fecha lleva hora — un
  // movimiento de las 11pm en UTC puede seguir siendo "hoy" en la zona del
  // negocio.
  // barberia_caja.fecha SÍ es un instante real (timestamptz), así que aquí
  // se compara contra el momento del cierre directo.
  const cajaHoy = data.caja.filter((m) => enTurnoActual({ creadoEn: m.fecha, fecha: fechaCalendarioLocal(m.fecha, negocio.timezone) }, negocio, hoy));
  const ventasCajaHoy = cajaHoy.filter((m) => m.tipo === "venta");
  const propinasCajaHoyEfectivo = cajaHoy.filter((m) => m.tipo === "propina" && m.metodo === "efectivo");
  const gastosCajaHoy = cajaHoy.filter((m) => m.tipo === "gasto");
  const ventasHoyTotal = citasHoyListo.reduce((acc, c) => acc + c.precio, 0) + ventasCajaHoy.reduce((acc, m) => acc + m.monto, 0);
  const citasAtendidas = citasHoyListo.length;
  const ventasPorEmpleado = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const c of citasHoyListo) {
      const nombre = c.empleadoNombreCache ?? "Dueño";
      mapa.set(nombre, (mapa.get(nombre) ?? 0) + c.precio);
    }
    for (const m of ventasCajaHoy) {
      const nombre = m.empleadoNombreCache ?? "Dueño";
      mapa.set(nombre, (mapa.get(nombre) ?? 0) + m.monto);
    }
    return Array.from(mapa, ([nombre, monto]) => ({ nombre, monto }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citasHoyListo, ventasCajaHoy]);

  // Lo que DEBERÍA haber en la caja: lo vendido (citas + ventas manuales de
  // Caja de hoy, de cualquier empleado) + propinas en efectivo + lo que ya
  // había de fondo, menos lo que ya se gastó hoy (Caja) y lo que se
  // registre en este mismo paso — no solo "efectivo vs ventas" (eso
  // ignoraba fondo inicial y gastos, mostrando faltantes reales como si
  // "sobrara" dinero). Los gastos de material del paso 2 no cuentan aquí:
  // todavía no existen cuando se muestra esta diferencia, en el paso 1.
  const fondoInicialNum = fondoInicial.trim() === "" ? 0 : Number(fondoInicial) || 0;
  const gastoPaso1Num = gastoMonto.trim() === "" ? 0 : Number(gastoMonto) || 0;
  const propinasCajaHoyTotal = propinasCajaHoyEfectivo.reduce((acc, m) => acc + m.monto, 0);
  const gastosCajaHoyTotal = gastosCajaHoy.reduce((acc, m) => acc + m.monto, 0);
  const esperado = redondear2(ventasHoyTotal + propinasCajaHoyTotal + fondoInicialNum - gastoPaso1Num - gastosCajaHoyTotal);

  // Los mismos sumandos de `esperado`, uno por uno, para que el dueño pueda
  // auditar de dónde sale el total (ver DesgloseCorte). Se arman de las
  // MISMAS variables a propósito: si se recalcularan aparte, podrían
  // discrepar del número real y la pantalla mentiría.
  const renglonesCorte: RenglonCorte[] = [
    { concepto: "Cortes y ventas", monto: ventasHoyTotal, tipo: "suma" },
    { concepto: "Propinas en efectivo", monto: propinasCajaHoyTotal, tipo: "suma" },
    { concepto: "Fondo inicial", monto: fondoInicialNum, tipo: "suma" },
    { concepto: "Gastos ya registrados", monto: gastosCajaHoyTotal, tipo: "resta" },
    { concepto: "Gasto que estás capturando", monto: gastoPaso1Num, tipo: "resta" },
  ];
  const efectivoValido = efectivoReal.trim() !== "" && !isNaN(Number(efectivoReal)) && Number(efectivoReal) >= 0;
  // Redondeado al peso entero: mismo criterio que mensajeDiferencia() (lib/mock.ts)
  // — así el color de arriba y el mensaje nunca se contradicen, y lo que se
  // guarda queda consistente con lo que vio el dueño.
  const diferencia = efectivoValido ? Math.round(Number(efectivoReal) - esperado) : null;

  function resetYCerrar() {
    const completado = paso === "resumen";
    setPaso(1);
    setFondoInicial("");
    setEfectivoReal("");
    setGastoMonto("");
    setGastoConcepto("");
    setPropinas("");
    setMateriales({});
    setOtroChecked(false);
    setOtroConcepto("");
    setOtroMonto("");
    setResumen(null);
    onClose();
    if (completado) onCompletado?.();
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
    if (!efectivoValido) return;
    setGuardando(true);
    const efectivoNum = Number(efectivoReal);
    const propinasNum = Number(propinas) || 0;
    const gastoPaso1 = Number(gastoMonto) || 0;

    const gastoConceptos: { concepto: string; monto: number }[] = [];
    if (gastoPaso1 > 0) {
      gastoConceptos.push({ concepto: gastoConcepto.trim() || "Gasto del día", monto: gastoPaso1 });
    }
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
    const gastosMaterialTotal = gastoConceptos.reduce((acc, g) => acc + g.monto, 0) - gastoPaso1;
    const gastosTotal = gastoConceptos.reduce((acc, g) => acc + g.monto, 0);

    const nowISO = new Date().toISOString();
    const nuevasEntradas: CajaEntry[] = [];
    if (propinasNum > 0) {
      nuevasEntradas.push({ id: uid("caja"), tipo: "propina", concepto: "Propinas del día", monto: propinasNum, metodo: "efectivo", fecha: nowISO, ...camposEmpleado() });
    }
    if (gastoPaso1 > 0) {
      nuevasEntradas.push({ id: uid("caja"), tipo: "gasto", concepto: gastoConcepto.trim() || "Gasto del día", monto: gastoPaso1, metodo: "efectivo", fecha: nowISO, ...camposEmpleado() });
    }
    // Material con producto de Inventario parecido: se descuenta 1 pieza de
    // stock (consumo real), además de registrar el gasto. Sin match, el
    // gasto se guarda igual — solo no hay stock que tocar.
    const stockADescontar = new Set<string>();
    for (const nombre of MATERIALES) {
      if (!(nombre in materiales)) continue;
      const monto = Number(materiales[nombre]) || 0;
      if (monto <= 0) continue;
      nuevasEntradas.push({ id: uid("caja"), tipo: "gasto", concepto: `Material: ${nombre}`, monto, metodo: "efectivo", fecha: nowISO, ...camposEmpleado() });
      const producto = buscarProductoSimilar(nombre, data.productos);
      if (producto) stockADescontar.add(producto.id);
    }
    if (otroChecked) {
      const monto = Number(otroMonto) || 0;
      if (monto > 0) {
        const concepto = otroConcepto.trim() || "Otro material";
        nuevasEntradas.push({ id: uid("caja"), tipo: "gasto", concepto: `Material: ${concepto}`, monto, metodo: "efectivo", fecha: nowISO, ...camposEmpleado() });
        const producto = buscarProductoSimilar(concepto, data.productos);
        if (producto) stockADescontar.add(producto.id);
      }
    }

    if (nuevasEntradas.length > 0 || stockADescontar.size > 0) {
      update((prev) => {
        const b = prev.barberia!;
        const caja = nuevasEntradas.length > 0 ? [...nuevasEntradas, ...b.caja] : b.caja;
        const productos =
          stockADescontar.size > 0
            ? b.productos.map((p) => (stockADescontar.has(p.id) ? { ...p, stock: Math.max(0, p.stock - 1) } : p))
            : b.productos;
        return { ...prev, barberia: { ...b, caja, productos } };
      });
    }

    if (esNegocioReal) {
      try {
        await cleanInsert("barberia_cortes", [
          {
            negocio_id: negocio.id,
            fecha: hoy,
            fondo_inicial: fondoInicial.trim() === "" ? null : Number(fondoInicial),
            ventas_calculadas: ventasHoyTotal,
            efectivo_real: efectivoNum,
            gastos: gastoPaso1 || null,
            diferencia: Math.round(efectivoNum - esperado),
            propinas_total: propinasNum,
            gastos_material: gastosMaterialTotal,
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

    setResumen({
      ventas: ventasHoyTotal,
      propinas: propinasNum,
      gastos: gastosTotal,
      ganancia: ventasHoyTotal - gastosTotal,
      gastoConceptos,
    });
    // Marca el momento del cierre en `negocios`: es lo que hace que el
    // SIGUIENTE corte arranque en cero, en todos los dispositivos a la vez
    // (esa tabla ya tiene canal de realtime). Sin esto, barbería y
    // abarrotera volvían a contar todo el día en el segundo turno — ver
    // lib/turno.ts y la migración 20260918000000.
    update((prev) => ({ ...prev, business: { ...prev.business, turnoCerradoEn: new Date().toISOString() } }));
    setGuardando(false);
    setPaso("resumen");
  }

  function textoResumen(r: Resumen): string {
    const partes = [`Hoy hiciste ${formatMoney(r.ventas)}`];
    if (r.propinas > 0) partes.push(`propinas ${formatMoney(r.propinas)}`);
    if (r.gastoConceptos.length > 0) {
      partes.push(`gastaste ${r.gastoConceptos.map((g) => `${formatMoney(g.monto)} en ${g.concepto.toLowerCase()}`).join(", ")}`);
    }
    // La GANANCIA solo la ve quien tiene verCorteDelDia (o sea: no el
    // vendedor). Es el número que de verdad importa cuidar — lo demás de
    // este resumen es lo que esa persona acaba de capturar con sus propias
    // manos, así que ocultárselo no protegería nada y solo se vería raro.
    if (puedeVerCorte) partes.push(`ganancia ${formatMoney(r.ganancia)}`);
    return `${partes.join(", ")}.`;
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && resetYCerrar()}>
      {sinConexion ? (
        <CierreBloqueado motivo="sin-conexion" titulo="Sin conexión" queEs="turno" onClose={resetYCerrar} />
      ) : yaFueCerrado ? (
        <CierreBloqueado motivo="ya-cerrado" titulo="Turno cerrado" queEs="turno" onClose={resetYCerrar} onContinuar={() => setYaFueCerrado(false)} />
      ) : paso === 1 ? (
        <>
          <SheetHeader title="Cerrar turno" description="Paso 1 de 2 · Corte" onClose={resetYCerrar} />
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ventas de hoy (calculadas)</p>
              <p className="font-display text-2xl font-bold text-ledger">{formatMoneyExacto(ventasHoyTotal)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Citas atendidas: {citasAtendidas}</p>
            </div>
            <VentasPorEmpleado datos={ventasPorEmpleado} />
            {gastosCajaHoy.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Gastos de hoy (ya registrados, se restan de lo que deberías tener)
                </p>
                {gastosCajaHoy.map((g) => (
                  <div key={g.id} className="flex items-center justify-between text-sm">
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {g.concepto}
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
              <Input
                type="number"
                inputMode="decimal"
                autoFocus
                className="h-14 text-lg"
                value={efectivoReal}
                onChange={(e) => setEfectivoReal(e.target.value)}
                placeholder="$0"
              />
              <DesgloseCorte renglones={renglonesCorte} esperado={esperado} desdeCuando={desdeCuandoCuenta(negocio, negocio.timezone)} />
              <MensajeCorte diferencia={diferencia} esperado={esperado} />
            </div>
            <div className="space-y-1.5">
              <Label>¿Gastaste hoy?</Label>
              <Input type="number" inputMode="decimal" value={gastoMonto} onChange={(e) => setGastoMonto(e.target.value)} placeholder="$0" />
              {gastoMonto.trim() !== "" && Number(gastoMonto) > 0 && (
                <Input value={gastoConcepto} onChange={(e) => setGastoConcepto(e.target.value)} placeholder="Concepto (ej. renta, luz)" />
              )}
            </div>
          </div>
          <SheetFooter>
            <Button size="lg" disabled={!efectivoValido} onClick={() => setPaso(2)}>
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
