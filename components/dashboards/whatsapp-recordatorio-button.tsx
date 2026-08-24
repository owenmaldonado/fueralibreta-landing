"use client";

import { MessageCircle } from "lucide-react";

import { mensajeRecordatorioCita, waLink } from "@/lib/mock";
import type { Appointment } from "@/lib/types";

/**
 * Botón verde de WhatsApp junto a "Listo" en cada cita (Agenda y Hoy) —
 * antes había que entrar al menú ⋮ > "Enviar recordatorio" para mandar el
 * mismo mensaje ("Hola {nombre}! Te esperamos... hoy a las {hora}...").
 *
 * Básico no lo tiene: reusa el mismo candado que ya gatea el aviso de
 * "28 días sin venir" (plan.giroBarberia.msg28, ver lib/planes.ts) en vez
 * de inventar una feature nueva — si algún día se separan, aquí es donde
 * cambiar la condición. Sin `disponible` no se renderiza nada — el mismo
 * envío de WhatsApp ya está disponible sin candado en el menú ⋮ de la
 * cita (ver CitaRow en app/app/agenda/page.tsx), así que mostrar este
 * botón bloqueado con badge "Pro" solo confundía (misma acción, un lado
 * bloqueado y el otro no).
 */
export function WhatsappRecordatorioButton({
  cita,
  negocioNombre,
  disponible,
}: {
  cita: Pick<Appointment, "clienteNombre" | "clienteTelefono" | "servicioNombre" | "fecha" | "hora">;
  negocioNombre: string;
  disponible: boolean;
}) {
  if (!cita.clienteTelefono || !disponible) return null;

  return (
    <a
      href={waLink(cita.clienteTelefono, mensajeRecordatorioCita(cita, negocioNombre))}
      target="_blank"
      rel="noreferrer"
      aria-label="Enviar recordatorio por WhatsApp"
      title="Enviar recordatorio por WhatsApp"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ledger/15 text-ledger hover:bg-ledger/25"
    >
      <MessageCircle className="h-4 w-4" />
    </a>
  );
}
