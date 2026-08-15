"use client";

import * as React from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { setEmpleadoActual, verificarPin } from "@/lib/empleados";
import type { Empleado, EmpleadoActual, RolEmpleado } from "@/lib/types";

export const ROL_LABEL: Record<RolEmpleado, string> = { dueno: "Dueño", encargado: "Encargado", vendedor: "Vendedor" };

/** 3 fallos = 30s de bloqueo local, 3 más (6 en total) = 5min — por empleado, guardado en localStorage para que sobreviva un refresh del dispositivo compartido. */
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
 * Lista de empleados activos + modal de PIN — la pieza reutilizable de
 * multiusuario, SIN pantalla completa ni Dialog propio: quien la usa
 * decide cómo mostrarla (ver components/app-shell/turno-control.tsx, que
 * la mete dentro de un Dialog disparado desde el header). Ya no bloquea la
 * app entera al abrirla — el login de vendedor pasó de ser obligatorio por
 * venta a opcional por sesión (ver TopBar/AuthenticatedShell): sin nadie
 * elegido aquí, la app funciona igual que un negocio de una sola persona.
 *
 * soloRol filtra qué empleados se listan — se usa para el atajo de
 * "Empleados" del candadito del dueño, que solo debe ofrecer PINs de rol
 * dueño (ver TurnoControl).
 */
export function SeleccionarEmpleado({
  negocioId,
  soloRol,
  excluirRol,
  extraAlInicio,
  onExito,
}: {
  negocioId: string;
  soloRol?: RolEmpleado[];
  /** Filtra roles FUERA de la lista — usado por TurnoControl para no duplicar la tarjeta sintética "Dueño" con un empleado rol='dueno' legacy. */
  excluirRol?: RolEmpleado[];
  /** Se renderiza antes de la lista, solo en la vista de lista (no mientras se escribe un PIN) — la tarjeta "Dueño" de TurnoControl vive aquí. */
  extraAlInicio?: React.ReactNode;
  onExito: (empleado: EmpleadoActual) => void;
}) {
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
        const todos: Empleado[] = (data ?? []).map((r) => ({
          id: r.id as string,
          negocioId: r.negocio_id as string,
          nombre: r.nombre as string,
          rol: r.rol as RolEmpleado,
          activo: r.activo as boolean,
          userId: (r.user_id as string) ?? undefined,
          createdAt: r.created_at as string,
        }));
        setEmpleados(todos.filter((e) => (!soloRol || soloRol.includes(e.rol)) && (!excluirRol || !excluirRol.includes(e.rol))));
      });
  }, [negocioId, soloRol, excluirRol]);

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
    // Reset explícito antes de volver a la lista — aunque errorMsg/pin ya
    // se limpian solos en cada intento, esto evita cualquier residuo si se
    // cierra a media verificación.
    setSeleccionado(null);
    setPin("");
    setVerificando(false);
    setErrorMsg(null);
  }

  async function confirmarPin() {
    if (!seleccionado || pin.length !== 4) return;
    const { fails, lockedUntil } = leerIntentos(seleccionado.id);
    if (lockedUntil > Date.now()) return;

    setVerificando(true);
    setErrorMsg(null);
    // verificarPin (lib/empleados.ts) nunca deja la promesa colgada — tiene
    // su propio timeout — pero igual todo esto va en un finally: no hay
    // camino donde "Entrar..." se quede girando para siempre.
    try {
      const resultado = await verificarPin(negocioId, seleccionado.id, pin);

      if (resultado.ok && resultado.empleado) {
        limpiarIntentos(seleccionado.id);
        setEmpleadoActual(resultado.empleado);
        onExito(resultado.empleado);
        return;
      }

      if (resultado.error === "network_error") {
        // No se llegó a verificar de verdad — no cuenta como intento fallido.
        toast.error("Error verificando PIN. Intenta de nuevo.");
        setPin("");
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
    } finally {
      setVerificando(false);
    }
  }

  const segundosRestantes = bloqueadoHasta > ahora ? Math.ceil((bloqueadoHasta - ahora) / 1000) : 0;

  if (seleccionado) {
    return (
      <div className="flex flex-col items-center gap-4">
        <DialogHeader title={seleccionado.nombre} description="Escribe tu PIN de 4 dígitos" onClose={cerrarModal} />
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
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {extraAlInicio}
      {empleados === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : empleados.length === 0 ? (
        !extraAlInicio && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {soloRol ? "No hay ningún dueño dado de alta todavía." : "No hay empleados dados de alta todavía."}
          </p>
        )
      ) : (
        empleados.map((emp) => (
          <button
            key={emp.id}
            onClick={() => abrirPin(emp)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary">
              {emp.nombre.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{emp.nombre}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{ROL_LABEL[emp.rol]}</p>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
