"use client";

import * as React from "react";
import { Pencil, Trash2, ChevronDown, Plus, X, Lock } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Sheet, SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BloqueoPlan } from "@/components/dashboards/bloqueo-plan";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { supabase } from "@/lib/supabase";
import { formatMoney, uid, todayISO } from "@/lib/mock";
import type { Dish, DishVariant } from "@/lib/types";

const CATEGORIA_CHIPS = ["Platillo fuerte", "Entrada", "Bebida", "Postre"];

export default function MenuPage() {
  const { session, ready, update } = useSession();
  const plan = usePlan();
  const [editando, setEditando] = React.useState<Dish | null>(null);
  const [borrando, setBorrando] = React.useState<Dish | null>(null);
  const [mostrarInactivos, setMostrarInactivos] = React.useState(false);

  if (!ready || !session) return <LoadingBlock />;

  const data = session.fonda!;
  const negocio = session.business;
  const esNegocioReal = Boolean(negocio.ownerId);

  const activos = data.platillos.filter((p) => p.activoHoy);
  const inactivos = data.platillos.filter((p) => !p.activoHoy);
  const categorias = Array.from(new Set(activos.map((p) => p.categoria)));

  // Registro directo en Supabase (fuera del sync genérico de update(), mismo
  // patrón que marcarEntregado en fonda-dashboard.tsx): fondita_menu_dia es
  // solo bitácora histórica de "qué estuvo disponible tal día" — nada la lee
  // todavía, activoHoy (arriba) sigue siendo el estado en vivo que usa toda
  // la app. Un registro por (negocio, platillo, día): si el dueño lo prende
  // y apaga varias veces el mismo día, se sobreescribe con upsert.
  async function toggle(id: string, nuevoEstado: boolean) {
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, platillos: f.platillos.map((p) => (p.id === id ? { ...p, activoHoy: nuevoEstado } : p)) } };
    });
    if (esNegocioReal) {
      const { error } = await supabase
        .from("fondita_menu_dia")
        .upsert(
          { negocio_id: negocio.id, producto_id: id, fecha: todayISO(0), esta_activo_hoy: nuevoEstado },
          { onConflict: "negocio_id,producto_id,fecha" }
        );
      if (error) console.error("No se pudo registrar el cambio de menú del día:", error);
    }
  }

  function eliminar() {
    if (!borrando) return;
    update((prev) => {
      const f = prev.fonda!;
      return { ...prev, fonda: { ...f, platillos: f.platillos.filter((p) => p.id !== borrando.id) } };
    });
    setBorrando(null);
  }

  return (
    <>
      <PageHeader title="Menú" subtitle="Marca lo que hay disponible hoy" />
      <div className="flex flex-col gap-5 px-4 pb-6">
        <div>
          <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-primary">Disponible hoy</p>
          <div className="flex flex-col gap-5">
            {categorias.map((cat) => (
              <div key={cat}>
                <p className="mb-2 px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">{cat}</p>
                <div className="flex flex-col gap-2">
                  {activos
                    .filter((p) => p.categoria === cat)
                    .map((p) => (
                      <PlatilloRow
                        key={p.id}
                        platillo={p}
                        onToggle={toggle}
                        onEditar={() => setEditando(p)}
                        onBorrar={() => setBorrando(p)}
                        menuDiaDisponible={plan.giroFonda.menuDia}
                      />
                    ))}
                </div>
              </div>
            ))}
            {activos.length === 0 && <p className="px-1 text-sm text-muted-foreground">Nada disponible hoy todavía.</p>}
          </div>
        </div>

        {inactivos.length > 0 && (
          <div>
            <button
              onClick={() => setMostrarInactivos((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left"
            >
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                No disponible hoy / Se acabó ({inactivos.length})
              </p>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${mostrarInactivos ? "rotate-180" : ""}`} />
            </button>
            {mostrarInactivos && (
              <div className="mt-2 flex flex-col gap-2 opacity-60">
                {inactivos.map((p) => (
                  <PlatilloRow
                    key={p.id}
                    platillo={p}
                    onToggle={toggle}
                    onEditar={() => setEditando(p)}
                    onBorrar={() => setBorrando(p)}
                    menuDiaDisponible={plan.giroFonda.menuDia}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && <PlatilloForm platillo={editando} onClose={() => setEditando(null)} update={update} />}
      </Sheet>

      <ConfirmDialog
        open={!!borrando}
        title="Eliminar platillo"
        description={`Se borrará "${borrando?.nombre}" del catálogo.`}
        onClose={() => setBorrando(null)}
        onConfirm={eliminar}
      />
    </>
  );
}

function PlatilloRow({
  platillo: p,
  onToggle,
  onEditar,
  onBorrar,
  menuDiaDisponible,
}: {
  platillo: Dish;
  onToggle: (id: string, nuevoEstado: boolean) => void;
  onEditar: () => void;
  onBorrar: () => void;
  /** básico no puede cambiar día a día qué hay disponible — el checkbox se reemplaza por un candado a /planes. */
  menuDiaDisponible: boolean;
}) {
  return (
    <div className="flex animate-in fade-in slide-in-from-top-1 items-center gap-3 rounded-xl border border-border bg-card p-3 duration-300">
      <label className="flex flex-1 items-center gap-2">
        {menuDiaDisponible ? (
          <Checkbox checked={p.activoHoy} onCheckedChange={() => onToggle(p.id, !p.activoHoy)} />
        ) : (
          <Link
            href="/planes"
            title="Menú del día (activar/desactivar platillos por día) disponible en Pro y Pro+"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground"
          >
            <Lock className="h-3 w-3" />
          </Link>
        )}
        <span className={`text-sm font-medium ${!p.activoHoy && "text-muted-foreground line-through"}`}>{p.nombre}</span>
        {p.estadoMerma && (
          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
            SOBRANTE DE AYER
          </span>
        )}
      </label>
      <span className="font-mono text-sm text-muted-foreground">{formatMoney(p.precio)}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        <button onClick={onEditar} aria-label="Editar platillo" className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onBorrar} aria-label="Eliminar platillo" className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function PlatilloForm({
  platillo,
  onClose,
  update,
}: {
  platillo: Dish;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const plan = usePlan();
  const [nombre, setNombre] = React.useState(platillo.nombre);
  const [precio, setPrecio] = React.useState(String(platillo.precio));
  const [categoria, setCategoria] = React.useState(platillo.categoria);
  const [costo, setCosto] = React.useState(platillo.costo != null ? String(platillo.costo) : "");
  const [variantes, setVariantes] = React.useState<DishVariant[]>(platillo.variantes ?? []);
  const [nuevoValor, setNuevoValor] = React.useState("");
  const [nuevoPrecioExtra, setNuevoPrecioExtra] = React.useState("");

  const puedeGuardar = nombre.trim().length > 1 && Number(precio) > 0;

  function agregarVariante() {
    if (!nuevoValor.trim()) return;
    setVariantes((prev) => [
      ...prev,
      { id: uid("var"), tipo: "Proteína", valor: nuevoValor.trim(), precioExtra: Number(nuevoPrecioExtra) || 0, disponible: true },
    ]);
    setNuevoValor("");
    setNuevoPrecioExtra("");
  }

  function quitarVariante(id: string) {
    setVariantes((prev) => prev.filter((v) => v.id !== id));
  }

  function toggleDisponibleVariante(id: string) {
    setVariantes((prev) => prev.map((v) => (v.id === id ? { ...v, disponible: !v.disponible } : v)));
  }

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const f = prev.fonda!;
      return {
        ...prev,
        fonda: {
          ...f,
          platillos: f.platillos.map((p) =>
            p.id === platillo.id
              ? {
                  ...p,
                  nombre: nombre.trim(),
                  precio: Number(precio),
                  categoria,
                  costo: costo.trim() === "" ? undefined : Number(costo),
                  variantes: variantes.length > 0 ? variantes : undefined,
                }
              : p
          ),
        },
      };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Editar platillo" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Precio</Label>
          <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Costo (opcional)</Label>
          <Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$0" />
        </div>
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <ChipGroup>
            {CATEGORIA_CHIPS.map((c) => (
              <Chip key={c} selected={categoria === c} onClick={() => setCategoria(c)}>
                {c}
              </Chip>
            ))}
          </ChipGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Variantes (ej. proteína: Pollo/Bistec)</Label>
          <BloqueoPlan activo={plan.giroFonda.variantes} texto="Variantes de platillo disponible en Pro y Pro+">
            {variantes.length > 0 && (
              <div className="flex flex-col gap-2">
                {variantes.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="flex-1 text-sm font-medium">{v.valor}</span>
                    <span className="font-mono text-xs text-muted-foreground">{v.precioExtra > 0 ? `+${formatMoney(v.precioExtra)}` : "sin costo extra"}</span>
                    <Switch checked={v.disponible} onCheckedChange={() => toggleDisponibleVariante(v.id)} />
                    <button onClick={() => quitarVariante(v.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>Valor</Label>
                <Input value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} placeholder="Ej. Pollo" />
              </div>
              <div className="w-24 space-y-1.5">
                <Label>Extra</Label>
                <Input type="number" inputMode="decimal" value={nuevoPrecioExtra} onChange={(e) => setNuevoPrecioExtra(e.target.value)} placeholder="$0" />
              </div>
              <Button type="button" variant="outline" size="icon" onClick={agregarVariante} aria-label="Agregar variante">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </BloqueoPlan>
        </div>
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!puedeGuardar} onClick={guardar}>
          Guardar cambios
        </Button>
      </SheetFooter>
    </>
  );
}
