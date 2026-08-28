"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { EmptyState } from "@/components/dashboards/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { supabase } from "@/lib/supabase";
import {
  generarPinDisponible,
  pinEsObvio,
  pinDuenoConfigurado,
  setPinDueno,
  borrarPinDueno,
  normalizarNombreEmpleado,
  ROL_LABEL,
} from "@/lib/empleados";
import { waLink } from "@/lib/mock";
import type { Empleado, RolEmpleado } from "@/lib/types";

/** WhatsApp de soporte — el mismo que usan las tarjetas de Planes. Un dueño que olvida su PIN escribe aquí y se lo reinician desde /admin (PinDuenoDialog). */
const WHATSAPP_SOPORTE = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "3329098631";

const ROLES: { rol: RolEmpleado; label: string }[] = [
  { rol: "dueno", label: "Dueño" },
  { rol: "encargado", label: "Encargado" },
  { rol: "vendedor", label: "Vendedor" },
];

/**
 * Ajustes > Empleados — solo dueño (protegida por middleware.ts, ver
 * RUTAS_SOLO_DUENO). Alta/edición/baja de negocio_empleados; los PIN se
 * generan y hashean SIEMPRE en Postgres (crear_empleado/actualizar_pin_empleado
 * en supabase/migrations/20260815000000_esquema.sql, vía pgcrypto) — este archivo nunca calcula ni guarda un
 * hash, solo pide el PIN en texto plano una vez para mostrárselo al dueño
 * y lo manda a la función de Supabase.
 */
export default function EmpleadosPage() {
  const { session, ready } = useSession();
  const plan = usePlan();
  const [empleados, setEmpleados] = React.useState<Empleado[] | null>(null);
  const [editando, setEditando] = React.useState<Empleado | "nuevo" | null>(null);
  const [borrando, setBorrando] = React.useState<Empleado | null>(null);
  const [pinSet, setPinSet] = React.useState<boolean | null>(null);

  const negocioId = session?.business.id;
  const esNegocioReal = Boolean(session?.business.ownerId);

  React.useEffect(() => {
    if (!negocioId || !esNegocioReal) return;
    pinDuenoConfigurado(negocioId).then(setPinSet);
  }, [negocioId, esNegocioReal]);

  // ?reset_pin=1 — camino heredado del "Olvidé mi PIN" por correo, que ya
  // no se ofrece (ver olvidePin en PinDuenoBanner: ahora es por WhatsApp
  // con soporte). Se deja vivo porque puede haber correos de ese flujo ya
  // enviados dando vueltas en la bandeja de algún dueño: si alguien abre
  // uno, sigue funcionando en vez de tirar un error. Lee la URL directo en
  // vez de useSearchParams() para no forzar un Suspense boundary en esta
  // página (que hoy renderiza estática).
  React.useEffect(() => {
    if (!negocioId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset_pin") !== "1") return;
    borrarPinDueno(negocioId)
      .then(() => {
        toast.success("PIN de dueño reiniciado. Configura uno nuevo cuando quieras.");
        setPinSet(false);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "No se pudo reiniciar el PIN."))
      .finally(() => window.history.replaceState({}, "", "/app/empleados"));
  }, [negocioId]);

  const cargar = React.useCallback(() => {
    if (!negocioId) return;
    supabase
      // Columnas explícitas y nunca "*": negocio_empleados guarda pin_hash
      // y RLS es por fila, no por columna. Además de la razón de seguridad,
      // la migración 20260913000000 revoca el select sobre esa columna, así
      // que un "*" aquí ya truena con "permission denied for column".
      .from("negocio_empleados")
      .select("id, negocio_id, nombre, rol, user_id, activo, created_at")
      .eq("negocio_id", negocioId)
      .order("created_at", { ascending: true })
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
    cargar();
  }, [cargar]);

  if (!ready || !session) return <LoadingBlock />;

  if (!esNegocioReal) {
    return (
      <>
        <PageHeader title="Empleados" subtitle="Multiusuario con PIN" />
        <div className="px-4 py-6">
          <EmptyState texto="Los empleados solo están disponibles en negocios reales, no en la demo." />
        </div>
      </>
    );
  }

  const activos = (empleados ?? []).filter((e) => e.activo);
  const inactivos = (empleados ?? []).filter((e) => !e.activo);
  // maxCuentas es distinto por giro (ver lib/planes.ts) — fondita no tiene
  // un número propio en la tabla que dio el negocio, así que cae al límite
  // genérico plano (plan.limites.max_empleados) como antes.
  const limite =
    session.business.tipo === "abarrotes"
      ? plan.giroAbarrotes.maxCuentas
      : session.business.tipo === "barberia"
        ? plan.giroBarberia.maxCuentas
        : plan.limites.max_empleados;
  const limiteAlcanzado = limite !== null && activos.length >= limite;

  async function desactivar(emp: Empleado, activo: boolean) {
    const { error } = await supabase.from("negocio_empleados").update({ activo }).eq("id", emp.id);
    if (error) {
      console.error("No se pudo actualizar el empleado:", error);
      return;
    }
    cargar();
  }

  async function eliminar() {
    if (!borrando) return;
    // Hard delete de negocio_empleados — las ventas pasadas de este
    // empleado conservan empleado_nombre_cache (empleado_id se pone en
    // null solo, on delete set null), así que el historial no se pierde.
    const { error } = await supabase.from("negocio_empleados").delete().eq("id", borrando.id);
    if (error) {
      console.error("No se pudo eliminar el empleado:", error);
    }
    setBorrando(null);
    cargar();
  }

  return (
    <>
      <PageHeader
        title="Empleados"
        subtitle="Multiusuario con PIN"
        action={
          <Button size="sm" variant="outline" disabled={limiteAlcanzado} onClick={() => setEditando("nuevo")}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-6">
        {negocioId && pinSet !== null && (
          <PinDuenoBanner
            negocioId={negocioId}
            pinSet={pinSet}
            onCambio={() => setPinSet(true)}
            nombreNegocio={session?.business.nombre ?? "mi negocio"}
          />
        )}

        {limiteAlcanzado && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
            Tu plan {plan.label} permite hasta {limite} {limite === 1 ? "cuenta" : "cuentas"} (contando al dueño).{" "}
            <Link href="/planes" className="font-medium text-primary hover:underline">
              Sube de plan
            </Link>{" "}
            para agregar más.
          </div>
        )}

        {empleados === null ? (
          <LoadingBlock />
        ) : empleados.length === 0 ? (
          <EmptyState texto="Sin empleados dados de alta — el negocio funciona igual que antes, sin kiosko." />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {activos.map((emp) => (
                <EmpleadoRow key={emp.id} empleado={emp} onEditar={() => setEditando(emp)} onBorrar={() => setBorrando(emp)} onToggle={(v) => desactivar(emp, v)} />
              ))}
            </div>
            {inactivos.length > 0 && (
              <div className="flex flex-col gap-2 opacity-60">
                <p className="px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Inactivos</p>
                {inactivos.map((emp) => (
                  <EmpleadoRow key={emp.id} empleado={emp} onEditar={() => setEditando(emp)} onBorrar={() => setBorrando(emp)} onToggle={(v) => desactivar(emp, v)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && negocioId && (
          <EmpleadoForm
            negocioId={negocioId}
            empleado={editando === "nuevo" ? null : editando}
            onClose={() => setEditando(null)}
            onGuardado={cargar}
          />
        )}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar empleado"
        description={`Se borrará a "${borrando?.nombre}" de la lista. Sus ventas pasadas conservan su nombre, pero ya no va a poder entrar con su PIN.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminar}
      />
    </>
  );
}

/**
 * PIN de dueño (OPCIONAL): banner NO bloqueante. Sin PIN, invita a
 * configurar uno; con PIN, muestra que ya quedó listo y ofrece "Olvidé mi
 * PIN" (reset por correo, ver lib/empleados.ts solicitarResetPinDueno —
 * manda un magic link a la cuenta ya logueada; al volver con sesión fresca
 * esta misma página borra el PIN, ver el efecto de ?reset_pin=1 arriba).
 */
function PinDuenoBanner({
  negocioId,
  pinSet,
  onCambio,
  nombreNegocio,
}: {
  negocioId: string;
  pinSet: boolean;
  onCambio: () => void;
  nombreNegocio: string;
}) {
  const [pin, setPin] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  async function guardar() {
    if (pin.length !== 4) return;
    setGuardando(true);
    try {
      await setPinDueno(negocioId, pin);
      toast.success("PIN de dueño configurado.");
      setPin("");
      onCambio();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el PIN.");
    } finally {
      setGuardando(false);
    }
  }

  // "Olvidé mi PIN" ya NO manda un magic link al correo. Ese flujo se veía
  // bien en teoría (correo → sesión fresca → se borra el PIN) pero en la
  // práctica el correo aterriza en la pantalla de login de Supabase y el
  // dueño se queda atorado ahí, sin PIN y sin manera de seguir. Ahora abre
  // WhatsApp con el mensaje ya escrito: soporte le pone un PIN nuevo desde
  // el panel de admin en 5 segundos (ver PinDuenoDialog) y se lo dicta.
  function olvidePin() {
    const mensaje = `Hola, soy ${nombreNegocio}. Olvidé mi PIN de dueño en Fuera Libreta, ¿me lo pueden reiniciar?`;
    window.open(waLink(WHATSAPP_SOPORTE, mensaje), "_blank");
  }

  if (pinSet) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm">
        <span className="text-muted-foreground">PIN de dueño configurado ✓</span>
        <button
          type="button"
          onClick={olvidePin}
          className="shrink-0 text-xs text-primary underline underline-offset-2"
        >
          Olvidé mi PIN
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm text-foreground">
        Configura tu PIN de dueño (opcional) — te deja volver a modo Dueño desde el selector de turno con un solo PIN.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          className="h-10 w-24 text-center tracking-[0.4em]"
        />
        <Button size="sm" disabled={pin.length !== 4 || guardando} onClick={guardar}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

function EmpleadoRow({
  empleado,
  onEditar,
  onBorrar,
  onToggle,
}: {
  empleado: Empleado;
  onEditar: () => void;
  onBorrar: () => void;
  onToggle: (activo: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary">
        {empleado.nombre.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{empleado.nombre}</p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{ROL_LABEL[empleado.rol]}</p>
      </div>
      <Switch checked={empleado.activo} onCheckedChange={onToggle} />
      <div className="flex shrink-0 items-center gap-0.5">
        <button onClick={onEditar} aria-label="Editar empleado" className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onBorrar} aria-label="Eliminar empleado" className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function EmpleadoForm({
  negocioId,
  empleado,
  onClose,
  onGuardado,
}: {
  negocioId: string;
  empleado: Empleado | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = React.useState(empleado?.nombre ?? "");
  const [rol, setRol] = React.useState<RolEmpleado>(empleado?.rol ?? "vendedor");
  const [pin, setPin] = React.useState("");
  const [pinError, setPinError] = React.useState<string | null>(null);
  const [generando, setGenerando] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [errorGuardar, setErrorGuardar] = React.useState<string | null>(null);

  const generarPin = React.useCallback(async () => {
    setGenerando(true);
    setPinError(null);
    try {
      setPin(await generarPinDisponible(negocioId));
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "No se pudo generar un PIN.");
    } finally {
      setGenerando(false);
    }
  }, [negocioId]);

  React.useEffect(() => {
    // Un empleado nuevo siempre arranca con un PIN sugerido, editable.
    if (!empleado) generarPin();
  }, [empleado, generarPin]);

  const puedeGuardar = nombre.trim().length > 1 && (empleado != null || (pin.length === 4 && !pinEsObvio(pin)));

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const nombreNormalizado = normalizarNombreEmpleado(nombre);
      if (empleado) {
        const { error } = await supabase.from("negocio_empleados").update({ nombre: nombreNormalizado, rol }).eq("id", empleado.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("crear_empleado", {
          p_negocio_id: negocioId,
          p_nombre: nombreNormalizado,
          p_rol: rol,
          p_pin: pin,
        });
        if (error) throw error;
      }
      onGuardado();
      onClose();
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : "No se pudo guardar. Revisa que el nombre no esté repetido.");
    } finally {
      setGuardando(false);
    }
  }

  async function regenerarPinExistente() {
    if (!empleado) return;
    setGenerando(true);
    setPinError(null);
    try {
      const nuevoPin = await generarPinDisponible(negocioId);
      const { error } = await supabase.rpc("actualizar_pin_empleado", { p_empleado_id: empleado.id, p_pin: nuevoPin });
      if (error) throw error;
      setPin(nuevoPin);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "No se pudo regenerar el PIN.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <SheetHeader title={empleado ? "Editar empleado" : "Nuevo empleado"} onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. María" />
        </div>
        <div className="space-y-1.5">
          <Label>Rol</Label>
          <ChipGroup>
            {ROLES.map((r) => (
              <Chip key={r.rol} selected={rol === r.rol} onClick={() => setRol(r.rol)}>
                {r.label}
              </Chip>
            ))}
          </ChipGroup>
        </div>
        <div className="space-y-1.5">
          <Label>PIN{empleado ? " actual" : ""}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={4}
              disabled={!!empleado}
              value={empleado ? "••••" : pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="flex-1 text-center text-lg tracking-[0.4em]"
            />
            <Button type="button" variant="outline" size="icon" disabled={generando} onClick={empleado ? regenerarPinExistente : generarPin} aria-label="Regenerar PIN">
              <RefreshCw className={`h-4 w-4 ${generando ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {pinError && <p className="text-xs text-destructive">{pinError}</p>}
          {!empleado && <p className="text-xs text-muted-foreground">Anótalo o enséñaselo ahora — no se vuelve a mostrar.</p>}
          {empleado && pin && <p className="text-xs text-ledger">Nuevo PIN: {pin} — anótalo, no se vuelve a mostrar.</p>}
        </div>
        {errorGuardar && <p className="text-sm text-destructive">{errorGuardar}</p>}
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar || guardando} onClick={guardar}>
          {empleado ? "Guardar cambios" : "Crear empleado"}
        </Button>
      </SheetFooter>
    </>
  );
}
