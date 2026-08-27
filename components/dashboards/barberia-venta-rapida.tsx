"use client";

import * as React from "react";
import { Zap } from "lucide-react";

import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { EmptyState } from "./empty-state";
import { BloqueoPlan } from "./bloqueo-plan";
import { getDaySlots } from "@/lib/agenda";
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
 * suelto, por dos razones:
 *  - Ocupa el horario. Mientras el barbero está atendiendo a este walk-in,
 *    la reserva pública (/b/[slug]) no puede agendar a alguien más en ese
 *    mismo hueco — que es justo el problema de no poder agendar sin señal.
 *  - Aparece sola en todo lo que ya lee citas: Caja (cortes del día),
 *    Agenda, Historial y el corte de Cerrar turno, sin tener que sumarla
 *    aparte en cada pantalla.
 *
 * La hora NO es la hora exacta del reloj sino el slot de 30 min en curso
 * (ver slotEnCurso): getDaySlots marca "ocupado" comparando contra la
 * rejilla de slots, así que una cita a las 10:17 no bloquearía el hueco de
 * las 10:00 y el horario se vería libre.
 */

/** Slot de la rejilla del día que contiene la hora actual — null si el negocio está cerrado hoy (no hay rejilla que ocupar). */
function slotEnCurso(data: NonNullable<TenantData["barberia"]>, hoy: string, timezone: string | undefined): string | null {
  const slots = getDaySlots(data, hoy, timezone);
  if (slots.length === 0) return null;
  const ahora = horaActualEnZona(timezone);
  let encontrado: string | null = null;
  for (const s of slots) {
    if (s.hora <= ahora) encontrado = s.hora;
    else break;
  }
  // Antes de abrir (ej. cobrar a las 8:40 con horario desde las 9:00) el
  // primer slot es el que corresponde, no "ninguno".
  return encontrado ?? slots[0].hora;
}

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
    const hora = slotEnCurso(data, hoy, negocio.timezone) ?? horaActualEnZona(negocio.timezone);
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
