"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";

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
import { generarPinDisponible, pinEsObvio } from "@/lib/empleados";
import type { Empleado, RolEmpleado } from "@/lib/types";

const ROLES: { rol: RolEmpleado; label: string }[] = [
  { rol: "dueno", label: "Dueño" },
  { rol: "encargado", label: "Encargado" },
  { rol: "vendedor", label: "Vendedor" },
];

const ROL_LABEL: Record<RolEmpleado, string> = { dueno: "Dueño", encargado: "Encargado", vendedor: "Vendedor" };

/**
 * Ajustes > Empleados — solo dueño (protegida por middleware.ts, ver
 * RUTAS_SOLO_DUENO). Alta/edición/baja de negocio_empleados; los PIN se
 * generan y hashean SIEMPRE en Postgres (crear_empleado/actualizar_pin_empleado
 * en supabase.sql, vía pgcrypto) — este archivo nunca calcula ni guarda un
 * hash, solo pide el PIN en texto plano una vez para mostrárselo al dueño
 * y lo manda a la función de Supabase.
 */
export default function EmpleadosPage() {
  const { session, ready } = useSession();
  const plan = usePlan();
  const [empleados, setEmpleados] = React.useState<Empleado[] | null>(null);
  const [editando, setEditando] = React.useState<Empleado | "nuevo" | null>(null);
  const [borrando, setBorrando] = React.useState<Empleado | null>(null);

  const negocioId = session?.business.id;
  const esNegocioReal = Boolean(session?.business.ownerId);

  const cargar = React.useCallback(() => {
    if (!negocioId) return;
    supabase
      .from("negocio_empleados")
      .select("*")
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
  const limite = plan.limites.max_empleados;
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
        {limiteAlcanzado && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
            Tu plan {plan.label} permite hasta {limite} {limite === 1 ? "persona" : "personas"} en negocio_empleados
            (contando al dueño). Sube de plan para agregar más.
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
      if (empleado) {
        const { error } = await supabase.from("negocio_empleados").update({ nombre: nombre.trim(), rol }).eq("id", empleado.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("crear_empleado", {
          p_negocio_id: negocioId,
          p_nombre: nombre.trim(),
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
