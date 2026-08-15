"use client";

import * as React from "react";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verificarPinDueno } from "@/lib/empleados";

/** Mismo umbral de bloqueo local que components/kiosko/quien-atiende.tsx, ver ahí por qué. */
const UMBRAL_BLOQUEO_CORTO = 3;
const BLOQUEO_CORTO_MS = 30_000;
const UMBRAL_BLOQUEO_LARGO = 6;
const BLOQUEO_LARGO_MS = 5 * 60_000;

function clave(negocioId: string) {
  return `fl_pin_dueno_intentos_${negocioId}`;
}

function leerIntentos(negocioId: string): { fails: number; lockedUntil: number } {
  try {
    const raw = localStorage.getItem(clave(negocioId));
    if (!raw) return { fails: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return { fails: parsed.fails ?? 0, lockedUntil: parsed.lockedUntil ?? 0 };
  } catch {
    return { fails: 0, lockedUntil: 0 };
  }
}

function guardarIntentos(negocioId: string, fails: number, lockedUntil: number) {
  localStorage.setItem(clave(negocioId), JSON.stringify({ fails, lockedUntil }));
}

function limpiarIntentos(negocioId: string) {
  localStorage.removeItem(clave(negocioId));
}

/** Entrada del PIN maestro de dueño — usado por TurnoControl (volver a DUEÑO) y TopBar (entrar a Empleados como encargado/vendedor). */
export function PinDuenoForm({
  negocioId,
  onExito,
  onCancel,
}: {
  negocioId: string;
  onExito: () => void;
  onCancel?: () => void;
}) {
  const [pin, setPin] = React.useState("");
  const [verificando, setVerificando] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [bloqueadoHasta, setBloqueadoHasta] = React.useState(() => leerIntentos(negocioId).lockedUntil);
  const [ahora, setAhora] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!bloqueadoHasta) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [bloqueadoHasta]);

  async function confirmar() {
    if (pin.length !== 4) return;
    const { fails, lockedUntil } = leerIntentos(negocioId);
    if (lockedUntil > Date.now()) return;

    setVerificando(true);
    setErrorMsg(null);
    const ok = await verificarPinDueno(negocioId, pin);
    setVerificando(false);

    if (ok) {
      limpiarIntentos(negocioId);
      onExito();
      return;
    }

    const nuevosFails = fails + 1;
    const nuevoBloqueo =
      nuevosFails >= UMBRAL_BLOQUEO_LARGO
        ? Date.now() + BLOQUEO_LARGO_MS
        : nuevosFails >= UMBRAL_BLOQUEO_CORTO
          ? Date.now() + BLOQUEO_CORTO_MS
          : 0;
    guardarIntentos(negocioId, nuevosFails, nuevoBloqueo);
    setBloqueadoHasta(nuevoBloqueo);
    setPin("");
    setErrorMsg(nuevoBloqueo > Date.now() ? "Demasiados intentos. Espera un momento." : "PIN incorrecto.");
  }

  const segundosRestantes = bloqueadoHasta > ahora ? Math.ceil((bloqueadoHasta - ahora) / 1000) : 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => e.key === "Enter" && confirmar()}
        disabled={segundosRestantes > 0}
        className="h-16 w-40 text-center text-2xl tracking-[0.5em]"
        placeholder="••••"
      />
      {segundosRestantes > 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <Lock className="h-3.5 w-3.5" /> Espera {segundosRestantes}s
        </p>
      ) : (
        errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>
      )}
      <Button size="lg" className="w-full" disabled={pin.length !== 4 || verificando || segundosRestantes > 0} onClick={confirmar}>
        {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
      </Button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground underline underline-offset-2">
          Cancelar
        </button>
      )}
    </div>
  );
}
