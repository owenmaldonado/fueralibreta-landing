"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { mensajeRecordatorioCita, waLink } from "@/lib/mock";
import type { Appointment } from "@/lib/types";

/**
 * Botón verde de WhatsApp junto a "Listo" en cada cita (Agenda y Hoy) —
 * antes había que entrar al menú ⋮ > "WhatsApp" para mandar el mismo
 * mensaje. Básico no lo tiene: reusa el mismo candado que ya gatea el
 * aviso de "28 días sin venir" (plan.giroBarberia.msg28, ver lib/planes.ts)
 * en vez de inventar una feature nueva. Sin `disponible` se ve bloqueado
 * con badge "Pro" y manda a /planes en vez de abrir WhatsApp — el ítem
 * "WhatsApp" del menú ⋮ (CitaRow, app/app/agenda/page.tsx) usa el MISMO
 * candado, así que básico ya no tiene ninguna puerta trasera para mandar
 * el mensaje gratis.
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
  if (!cita.clienteTelefono) return null;

  if (!disponible) {
    return (
      <Link
        href="/planes"
        aria-label="Recordatorio por WhatsApp — disponible en Pro y Pro+"
        title="Disponible en Pro y Pro+"
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground opacity-60"
      >
        <MessageCircle className="h-4 w-4" />
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-primary px-1 py-0.5 font-mono text-[8px] font-bold uppercase leading-none text-primary-foreground">
          Pro
        </span>
      </Link>
    );
  }

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
