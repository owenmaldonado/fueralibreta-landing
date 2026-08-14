"use client";

import * as React from "react";
import { Loader2, Lock } from "lucide-react";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { setEmpleadoActual, verificarPin } from "@/lib/empleados";
import type { Empleado, RolEmpleado } from "@/lib/types";

const ROL_LABEL: Record<RolEmpleado, string> = { dueno: "Dueño", encargado: "Encargado", vendedor: "Vendedor" };

/** 3 fallos = 30s de bloqueo local, 3 más (6 en total) = 5min — por empleado, guardado en localStorage para que sobreviva un refresh del kiosko compartido. */
const UMBRAL_BLOQUEO_CORTO = 3;
const BLOQUEO_CORTO_MS = 30_000;
const UMBRAL_BLOQUEO_LARGO = 6;
const BLOQUEO_LARGO_MS = 5 * 60_000;

function claveIntentos(empleadoId: string) {
  return `fl_pin_intentos_${empleadoId}`;
}

function leerIntentos(empleadoId: string): { fails: number; lockedUntil: number } {
  try {
    const raw = localStorage.getItem(claveIntentos(empleadoId));
    if (!raw) return { fails: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return { fails: parsed.fails ?? 0, lockedUntil: parsed.lockedUntil ?? 0 };
  } catch {
    return { fails: 0, lockedUntil: 0 };
  }
}

function guardarIntentos(empleadoId: string, fails: number, lockedUntil: number) {
  localStorage.setItem(claveIntentos(empleadoId), JSON.stringify({ fails, lockedUntil }));
}

function limpiarIntentos(empleadoId: string) {
  localStorage.removeItem(claveIntentos(empleadoId));
}

/**
 * "¿Quién atiende?": pantalla de kiosko para negocios con empleados dados
 * de alta (negocio_empleados). Se muestra en vez del contenido normal de
 * /app cuando no hay un empleado activo en la cookie fl_empleado (ver
 * AuthenticatedShell). Tocar un empleado abre el modal de PIN; con el PIN
 * correcto (Edge Function verificar-pin) se guarda fl_empleado y se
 * recarga para entrar en modo empleado (o modo dueño si el PIN era el del
 * dueño). El bloqueo de intentos es puramente del front — la Edge Function
 * ya registra cada intento en auditoria_pin para que el dueño pueda
 * auditar, pero decidir "espera 30s" es una cortesía de UX, no seguridad
 * real (la seguridad real es que el PIN nunca sale de la base de datos en
 * texto plano).
 */
export function QuienAtiende({ negocioId, onEntrar }: { negocioId: string; onEntrar: (empleado: { id: string; nombre: string; rol: RolEmpleado }) => void }) {
  const [empleados, setEmpleados] = React.useState<Empleado[] | null>(null);
  const [seleccionado, setSeleccionado] = React.useState<Empleado | null>(null);
  const [pin, setPin] = React.useState("");
  const [verificando, setVerificando] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [bloqueadoHasta, setBloqueadoHasta] = React.useState(0);
  const [ahora, setAhora] = React.useState(() => Date.now());

  React.useEffect(() => {
    supabase
      .from("negocio_empleados")
      .select("*")
      .eq("negocio_id", negocioId)
      .eq("activo", true)
      .order("rol", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("No se pudieron cargar los empleados:", error);
          setEmpleados([]);
          return;
        }
        setEmpleados(
          (data ?? []).map((r) => ({
            id: r.id as string,
            negocioId: r.negocio_id as string,
            nombre: r.nombre as string,
            rol: r.rol as RolEmpleado,
            activo: r.activo as boolean,
            userId: (r.user_id as string) ?? undefined,
            createdAt: r.created_at as string,
          }))
        );
      });
  }, [negocioId]);

  React.useEffect(() => {
    if (!bloqueadoHasta) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [bloqueadoHasta]);

  function abrirPin(emp: Empleado) {
    const { lockedUntil } = leerIntentos(emp.id);
    setSeleccionado(emp);
    setPin("");
    setErrorMsg(null);
    setBloqueadoHasta(lockedUntil);
  }

  function cerrarModal() {
    setSeleccionado(null);
    setPin("");
    setErrorMsg(null);
  }

  async function confirmarPin() {
    if (!seleccionado || pin.length !== 4) return;
    const { fails, lockedUntil } = leerIntentos(seleccionado.id);
    if (lockedUntil > Date.now()) return;

    setVerificando(true);
    setErrorMsg(null);
    const resultado = await verificarPin(negocioId, seleccionado.id, pin);
    setVerificando(false);

    if (resultado.ok && resultado.empleado) {
      limpiarIntentos(seleccionado.id);
      setEmpleadoActual(resultado.empleado);
      onEntrar(resultado.empleado);
      return;
    }

    const nuevosFails = fails + 1;
    const nuevoBloqueo =
      nuevosFails >= UMBRAL_BLOQUEO_LARGO
        ? Date.now() + BLOQUEO_LARGO_MS
        : nuevosFails >= UMBRAL_BLOQUEO_CORTO
          ? Date.now() + BLOQUEO_CORTO_MS
          : 0;
    guardarIntentos(seleccionado.id, nuevosFails, nuevoBloqueo);
    setBloqueadoHasta(nuevoBloqueo);
    setPin("");
    setErrorMsg(nuevoBloqueo > Date.now() ? "Demasiados intentos. Espera un momento." : "PIN incorrecto.");
  }

  const segundosRestantes = bloqueadoHasta > ahora ? Math.ceil((bloqueadoHasta - ahora) / 1000) : 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold">¿Quién atiende?</h1>
        <p className="mt-1 text-sm text-muted-foreground">Toca tu nombre y escribe tu PIN</p>
      </div>

      {empleados === null ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : empleados.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay empleados dados de alta todavía.</p>
      ) : (
        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          {empleados.map((emp) => (
            <button
              key={emp.id}
              onClick={() => abrirPin(emp)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 transition-colors active:scale-[0.98]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 font-display text-lg font-bold text-primary">
                {emp.nombre.slice(0, 1).toUpperCase()}
              </div>
              <p className="text-sm font-semibold leading-tight">{emp.nombre}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{ROL_LABEL[emp.rol]}</p>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!seleccionado} onOpenChange={(o) => !o && cerrarModal()}>
        {seleccionado && (
          <>
            <DialogHeader title={seleccionado.nombre} description="Escribe tu PIN de 4 dígitos" onClose={cerrarModal} />
            <div className="flex flex-col items-center gap-4">
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => e.key === "Enter" && confirmarPin()}
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
              <Button size="lg" className="w-full" disabled={pin.length !== 4 || verificando || segundosRestantes > 0} onClick={confirmarPin}>
                {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
