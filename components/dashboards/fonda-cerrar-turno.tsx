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
import { useOnlineStatus } from "@/lib/use-online-status";
import { diaDelNegocio } from "@/lib/chart-buckets";
import { CierreBloqueado } from "./cierre-bloqueado";
import { formatMoney, formatMoneyExacto, redondear2, uid } from "@/lib/mock";
import { MensajeCorte } from "./mensaje-corte";
import { camposEmpleado } from "@/lib/empleados";
import { cerrarTurno } from "@/lib/turno-fonda";
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
  /** Se dispara SOLO cuando terminarMerma() llega al final de verdad (turno cerrado) — nunca si se cancela en Paso 1/2 (resetYCerrar ahí no lo llama). Mismo propósito que en barberia-cerrar-turno.tsx: TopBar lo usa para, en modo vendedor, recién ahí pedir el PIN de dueño y volver al panel. */
  onCompletado?: () => void;
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
export function CerrarTurnoSheet({ open, onClose, session, update, hoyEnSuZona, onCompletado }: Props) {
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
  const online = useOnlineStatus();
  // A diferencia de barbería/abarrotera, aquí NO hay bloqueo de "ya se
  // cerró hoy": la fonda cierra por TURNO, no por día (ver
  // turnoFondaCerradoEn abajo), así que cerrar dos veces el mismo día es
  // legítimo — turno de la mañana y turno de la tarde. El propio marcador
  // de turno evita que el segundo corte vuelva a contar lo del primero.
  const sinConexion = !online && esNegocioReal;

  // Mismo criterio que el StatTile "Ventas" del dashboard (ver comentario
  // en fonda-dashboard.tsx): el corte es de todo lo entregado desde el
  // último cierre COMPARTIDO (negocio.turnoFondaCerradoEn, en `negocios`),
  // no del turnoId local de este dispositivo — así un vendedor que cobró
  // en otra tablet sí entra al corte del dueño, y un cierre pasada la
  // medianoche tampoco se corta a la mitad.
  const pedidosDelTurno = React.useMemo(() => {
    // Mismo cálculo que enTurnoActual() en fonda-dashboard.tsx, y por la
    // misma razón: cuando todavía no hay ningún cierre previo, el arranque
    // NO puede ser `new Date(`${hoy}T00:00:00`)` — esa es la medianoche del
    // DISPOSITIVO, no la del negocio, así que en un celular en otra zona el
    // corte incluía pedidos de ayer o se dejaba fuera los de la madrugada.
    // Ese caso se resuelve comparando el DÍA del negocio; solo el caso "sí
    // hay cierre previo" compara instantes, que ahí sí es lo correcto
    // (un turno arranca en un momento exacto, no a medianoche).
    //
    // Si esto no coincidiera con el dashboard, el corte y el cuadro de
    // "Ventas" mostrarían números distintos para el mismo turno.
    const cerradoEn = negocio.turnoFondaCerradoEn ? new Date(negocio.turnoFondaCerradoEn) : null;
    return data.pedidos.filter((p) => {
      if (p.estado !== "entregado") return false;
      if (!p.creadoEn) return p.fecha === hoyEnSuZona;
      if (cerradoEn) return new Date(p.creadoEn) >= cerradoEn;
      return diaDelNegocio(p.creadoEn, negocio.timezone) === hoyEnSuZona;
    });
  }, [data.pedidos, negocio.turnoFondaCerradoEn, hoyEnSuZona]);

  const ventasHoy = pedidosDelTurno.reduce((acc, p) => acc + p.total, 0);
  const ventasPorEmpleado = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of pedidosDelTurno) {
      const nombre = p.empleadoNombreCache ?? "Dueño";
      mapa.set(nombre, (mapa.get(nombre) ?? 0) + p.total);
    }
    return Array.from(mapa, ([nombre, monto]) => ({ nombre, monto }));
  }, [pedidosDelTurno]);

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
  // "sobrara" dinero). "Lo que se gastó" antes SOLO era el campo de este
  // mismo paso — un gasto registrado hoy desde Gastos/Ventas (por
  // cualquier empleado) no se restaba, así que el corte podía decir que
  // sobraba dinero que en realidad ya se había gastado en otro lado.
  const gastosHoyDelDia = data.gastos.filter((g) => g.fecha === hoyEnSuZona);
  const fondoInicialNum = fondoInicial.trim() === "" ? 0 : Number(fondoInicial) || 0;
  const gastoNum = gastoMonto.trim() === "" ? 0 : Number(gastoMonto) || 0;
  const gastosHoyDelDiaTotal = gastosHoyDelDia.reduce((acc, g) => acc + g.monto, 0);
  const esperado = redondear2(ventasHoy + fondoInicialNum - gastoNum - gastosHoyDelDiaTotal);
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
      const gasto: Expense = {
        id: uid("exp"),
        categoria: gastoConcepto.trim() || "Gasto del día",
        monto: gastoNum,
        fecha: hoyEnSuZona,
        ...camposEmpleado(),
      };

      // Igual que en app/app/gastos/page.tsx: el gasto del corte es dinero
      // real, así que se espera la confirmación de Supabase ANTES de
      // tocar el estado local — nada de optimista (ver bug crítico
      // "gastos no se guardan al refrescar").
      if (esNegocioReal) {
        setGuardando(true);
        try {
          await insertGastoDirecto(negocio.id, "fonda", [gasto]);
        } catch {
          toast.error("No se pudo guardar el gasto del día — revisa tu conexión e intenta de nuevo.");
          setGuardando(false);
          return;
        }
        setGuardando(false);
      }

      update((prev) => {
        const f = prev.fonda!;
        return { ...prev, fonda: { ...f, gastos: [gasto, ...f.gastos] } };
      }, { yaSincronizado: true });
    }

    if (esNegocioReal) {
      try {
        await cleanInsert("fondita_cortes", [
          {
            negocio_id: negocio.id,
            fecha: hoyEnSuZona,
            fondo_inicial: fondoInicial.trim() === "" ? null : Number(fondoInicial),
            ventas_calculadas: ventasHoy,
            efectivo_real: efectivoNum,
            gastos: gastoNum,
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
        nuevosGastos.push({ id: uid("exp"), categoria: `Merma: ${p.nombre}`, monto: montoTirado, fecha: hoyEnSuZona, ...camposEmpleado() });
      }
    }

    if (esNegocioReal && mermaRows.length > 0) {
      try {
        await cleanInsert("fondita_mermas", mermaRows);
      } catch (error) {
        console.error("No se pudieron guardar las mermas:", error);
      }
    }

    // La merma "se tiró" con monto es dinero real perdido (Expense), así
    // que se inserta y se confirma ANTES de tocar el estado local — mismo
    // criterio que guardarCorte() arriba.
    if (esNegocioReal && nuevosGastos.length > 0) {
      try {
        await insertGastoDirecto(negocio.id, "fonda", nuevosGastos);
      } catch {
        toast.error("No se pudo guardar la merma como gasto — revisa tu conexión e intenta de nuevo.");
        setGuardando(false);
        return;
      }
    }

    // Dos update() separados a propósito: el de platillos es un cambio
    // normal que syncTenantDiff debe subir como siempre; el de gastos ya
    // se insertó a mano arriba, así que va con yaSincronizado para no
    // duplicarlo (ver nota en lib/session.ts).
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
      return { ...prev, fonda: { ...f, platillos } };
    });

    if (nuevosGastos.length > 0) {
      update((prev) => {
        const f = prev.fonda!;
        return { ...prev, fonda: { ...f, gastos: [...nuevosGastos, ...f.gastos] } };
      }, { yaSincronizado: true });
    }

    // Cierre real del turno: solo aquí se toca (no en un "cancelar" a medio
    // wizard). cerrarTurno(negocio.id) sigue limpiando el turnoId local
    // (legacy, ya no se usa para filtrar, se deja por si algo más lo lee)
    // — lo que de verdad reinicia "Ventas de hoy"/Corte en TODOS los
    // dispositivos es turnoFondaCerradoEn: se guarda con update() para que
    // syncTenantDiff lo suba a `negocios` y el canal de realtime que esa
    // tabla ya tiene lo propague al resto de dispositivos del negocio.
    cerrarTurno(negocio.id);
    update((prev) => ({ ...prev, business: { ...prev.business, turnoFondaCerradoEn: new Date().toISOString() } }));
    setGuardando(false);
    resetYCerrar();
    onCompletado?.();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && resetYCerrar()}>
      {sinConexion ? (
        <CierreBloqueado motivo="sin-conexion" titulo="Sin conexión" queEs="turno" onClose={resetYCerrar} />
      ) : paso === 1 ? (
        <>
          <SheetHeader title="Cerrar turno" description="Paso 1 de 2 · Corte" onClose={resetYCerrar} />
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ventas de hoy (calculadas)</p>
              <p className="font-display text-2xl font-bold text-ledger">{formatMoneyExacto(ventasHoy)}</p>
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
              <MensajeCorte diferencia={diferencia} esperado={esperado} />
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
            <Button size="lg" disabled={!efectivoValido || guardando} onClick={guardarCorte}>
              {guardando ? "Guardando..." : "Continuar a Merma"}
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
