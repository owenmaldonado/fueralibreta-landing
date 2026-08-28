"use client";

import * as React from "react";
import { Zap } from "lucide-react";

import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { EmptyState } from "./empty-state";
import { BloqueoPlan } from "./bloqueo-plan";
import { horaActualEnZona } from "@/lib/fecha";
import { formatMoney, uid } from "@/lib/mock";
import { camposEmpleado } from "@/lib/empleados";
import { encolarVentaPendiente } from "@/lib/offline-sales-queue";
import { usePlan } from "@/lib/planes";
import { cn } from "@/lib/utils";
import type { Appointment, BarberService, TenantData, SessionUpdater } from "@/lib/types";

/**
 * Venta rápida de barbería — el equivalente al grid de platillos de Fondita,
 * pensado para el walk-in: alguien llega sin cita, se le corta y se cobra,
 * sin capturar nombre ni teléfono.
 *
 * Se guarda como una CITA ya cobrada (estado "listo"), no como un CajaEntry
 * suelto, para que aparezca sola en todo lo que ya lee citas: Caja (cortes
 * del día), Agenda, Historial y el corte de Cerrar turno, sin tener que
 * sumarla aparte en cada pantalla.
 *
 * LA HORA NO RESERVA HORARIO. Antes esta venta se guardaba pegada al slot
 * de 30 min en curso (las 6:30, las 7:00...) para "ocupar el hueco"
 * mientras el barbero atendía. Estaba mal por los dos lados:
 *
 *  - Un walk-in ya cobrado no es una cita futura. Que tapara el hueco
 *    significaba que dos personas que llegan seguidas dentro de la misma
 *    media hora chocaban entre sí, y que la página pública dejaba de
 *    ofrecer un horario que en realidad seguía libre.
 *  - La hora que quedaba escrita no era la hora en que se cobró, sino la
 *    del bloque — se veía "6:30" para algo cobrado a las 6:47.
 *
 * Ahora se guarda la hora REAL del reloj del negocio, como sello de cuándo
 * se cobró y nada más. Quien reserva horario son las citas pendientes, no
 * las ventas ya hechas (ver getDaySlots en lib/agenda.ts).
 */

interface Props {
  open: boolean;
  onClose: () => void;
  session: TenantData;
  update: SessionUpdater;
  hoy: string;
}

export function VentaRapidaSheet({ open, onClose, session, update, hoy }: Props) {
  const data = session.barberia!;
  const negocio = session.business;
  const plan = usePlan();
  const [metodo, setMetodo] = React.useState<"efectivo" | "transferencia">("efectivo");

  const maxCitas = plan.giroBarberia.maxCitas;
  const mesActual = hoy.slice(0, 7);
  const bloqueadoPorLimite =
    maxCitas !== null && data.citas.filter((c) => c.fecha.startsWith(mesActual) && c.estado !== "cancelada").length >= maxCitas;

  function vender(servicio: BarberService) {
    if (bloqueadoPorLimite) return;
    const citaId = uid("cita");
    // Hora real del negocio (no un slot de la rejilla) — ver el comentario
    // de arriba: esta venta ya está cobrada, no aparta horario.
    const hora = horaActualEnZona(negocio.timezone);
    let citaCreada: Appointment | null = null;
    let negocioId = "";
    update(
      (prev) => {
        const b = prev.barberia!;
        const cita: Appointment = {
          id: citaId,
          // Sin cliente a propósito: clienteId "" viaja como null a
          // barberia_citas.cliente_id (FK), ver citaToRow en lib/data.ts.
          clienteId: "",
          clienteNombre: "Venta rápida",
          clienteTelefono: "",
          servicioId: servicio.id,
          servicioNombre: servicio.nombre,
          precio: servicio.precio,
          fecha: hoy,
          hora,
          estado: "listo",
          metodo,
          ...camposEmpleado(),
        };
        citaCreada = cita;
        negocioId = prev.business.id;
        return { ...prev, barberia: { ...b, citas: [cita, ...b.citas] } };
      },
      { ventaOffline: true }
    );
    if (citaCreada && typeof navigator !== "undefined" && !navigator.onLine) {
      encolarVentaPendiente({
        id: citaId,
        negocioId,
        tipo: "barberia_venta_rapida",
        payload: citaCreada,
        ...camposEmpleado(),
      }).catch((err) => console.error("No se pudo encolar la venta rápida:", err));
    }
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetHeader title="Venta rápida" description="Cliente sin cita — un toque y queda cobrado" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>¿Cómo pagó?</Label>
          <ChipGroup>
            <Chip selected={metodo === "efectivo"} onClick={() => setMetodo("efectivo")}>
              Efectivo
            </Chip>
            <Chip selected={metodo === "transferencia"} onClick={() => setMetodo("transferencia")}>
              Transferencia
            </Chip>
          </ChipGroup>
        </div>

        {bloqueadoPorLimite && (
          <BloqueoPlan activo={false} compacto texto={`Llegaste al límite de ${maxCitas} citas este mes de tu plan ${plan.label}`} />
        )}

        <div className="space-y-1.5">
          <Label>¿Qué le hiciste?</Label>
          {data.servicios.length === 0 ? (
            <EmptyState texto="Todavía no tienes servicios dados de alta" />
          ) : (
            <div className={cn("flex max-h-[45vh] flex-col gap-2 overflow-y-auto", bloqueadoPorLimite && "pointer-events-none opacity-50")}>
              {data.servicios.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => vender(s)}
                  disabled={bloqueadoPorLimite}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 active:scale-[0.98]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.nombre}</span>
                  <span className="shrink-0 font-mono text-sm text-ledger">{formatMoney(s.precio)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** Botón largo que abre la hoja — vive en el dashboard de Barbería, arriba de las citas del día. */
export function VentaRapidaBoton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-4 font-semibold text-primary transition-colors hover:bg-primary/15 active:scale-[0.99]"
    >
      <Zap className="h-4 w-4 shrink-0" />
      Venta rápida
    </button>
  );
}
