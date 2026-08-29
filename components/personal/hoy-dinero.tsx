"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { borrarMovimiento, crearMovimiento, obtenerMovimientos } from "@/lib/personal/api";
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, categoriaPorClave, pesos } from "@/lib/personal/categorias";
import type { ISODate, Movimiento, TipoMovimiento } from "@/lib/personal/tipos";
import { EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";

/**
 * Gasto del día en dos toques: escribes el monto, picas la categoría, listo.
 *
 * El formulario está SIEMPRE abierto (no detrás de un botón "+"): registrar un
 * gasto es la acción que más se abandona por fricción, y un campo ya visible
 * con el teclado numérico a un toque es la diferencia entre llevar cuentas y
 * no llevarlas.
 */
export function BloqueDinero({ fecha }: { fecha: ISODate }) {
  const [movimientos, setMovimientos] = React.useState<Movimiento[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [tipo, setTipo] = React.useState<TipoMovimiento>("gasto");
  const [monto, setMonto] = React.useState("");
  const [categoria, setCategoria] = React.useState("comida");
  const [nota, setNota] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      setMovimientos(await obtenerMovimientos(fecha, fecha));
    } catch (err) {
      console.error("No se pudieron leer los movimientos:", err);
      toast.error("No se pudo cargar el dinero del día");
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  React.useEffect(() => {
    void cargar();
  }, [cargar]);

  const catalogo = tipo === "gasto" ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO;

  // Al cambiar de gasto a ingreso, la categoría anterior puede no existir en el
  // catálogo nuevo ("transporte" no es un ingreso): se cae a la primera.
  React.useEffect(() => {
    if (!catalogo.some((c) => c.clave === categoria)) setCategoria(catalogo[0].clave);
  }, [catalogo, categoria]);

  const gastado = movimientos.filter((m) => m.tipo === "gasto").reduce((a, m) => a + m.monto, 0);
  const recibido = movimientos.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0);

  const montoNumero = Number(monto.replace(",", "."));
  const puedeGuardar = Number.isFinite(montoNumero) && montoNumero > 0 && !guardando;

  async function agregar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      const nuevo = await crearMovimiento({
        fecha,
        tipo,
        monto: montoNumero,
        categoria,
        metodo: null,
        nota: nota.trim() || null,
      });
      setMovimientos((lista) => [nuevo, ...lista]);
      setMonto("");
      setNota("");
    } catch (err) {
      console.error("No se pudo guardar el movimiento:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(id: string) {
    const respaldo = movimientos;
    setMovimientos((lista) => lista.filter((m) => m.id !== id));
    try {
      await borrarMovimiento(id);
    } catch (err) {
      console.error("No se pudo borrar el movimiento:", err);
      setMovimientos(respaldo);
      toast.error("No se pudo borrar");
    }
  }

  return (
    <Tarjeta>
      <TituloTarjeta
        accion={
          <div className="flex items-baseline gap-3 text-[13px]">
            {recibido > 0 && (
              <span className="mid-num font-semibold text-[hsl(var(--mid-cumplido))]">+{pesos(recibido)}</span>
            )}
            <span className="mid-num font-semibold">{pesos(gastado)}</span>
          </div>
        }
      >
        Dinero de hoy
      </TituloTarjeta>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTipo(tipo === "gasto" ? "ingreso" : "gasto")}
          aria-label={tipo === "gasto" ? "Cambiar a ingreso" : "Cambiar a gasto"}
          title={tipo === "gasto" ? "Es un gasto — toca para cambiar a ingreso" : "Es un ingreso — toca para cambiar a gasto"}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors",
            tipo === "gasto"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-[hsl(var(--mid-cumplido))]/40 bg-[hsl(var(--mid-cumplido))]/10 text-[hsl(var(--mid-cumplido))]"
          )}
        >
          {tipo === "gasto" ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
        </button>

        <div className="flex h-11 flex-1 items-center rounded-lg border border-input bg-surface px-3">
          <span className="mr-1 text-lg text-muted-foreground">$</span>
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            inputMode="decimal"
            placeholder="0"
            className="mid-num w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        <button
          type="button"
          disabled={!puedeGuardar}
          onClick={agregar}
          aria-label="Guardar movimiento"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity active:scale-95 disabled:opacity-40"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      <div className="mid-sin-barra -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {catalogo.map((c) => (
          <button
            key={c.clave}
            type="button"
            onClick={() => setCategoria(c.clave)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
              categoria === c.clave
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <span aria-hidden>{c.emoji}</span>
            {c.etiqueta}
          </button>
        ))}
      </div>

      {monto && (
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregar()}
          placeholder="Nota (opcional)"
          className="mid-entrada mt-2 w-full rounded-lg border border-dashed border-border bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
        />
      )}

      <div className="mt-3">
        {cargando ? (
          <EstadoVacio>Cargando…</EstadoVacio>
        ) : movimientos.length === 0 ? (
          <EstadoVacio className="py-2">Sin movimientos hoy.</EstadoVacio>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {movimientos.map((m) => {
              const cat = categoriaPorClave(m.categoria);
              return (
                <li key={m.id} className="group flex items-center gap-2.5 py-2">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]"
                    style={{ background: `${cat.color.replace(")", " / 0.16)")}` }}
                  >
                    {cat.emoji}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">
                    {cat.etiqueta}
                    {m.nota && <span className="text-muted-foreground"> · {m.nota}</span>}
                  </span>
                  <span
                    className={cn(
                      "mid-num shrink-0 text-[14px] font-semibold",
                      m.tipo === "ingreso" && "text-[hsl(var(--mid-cumplido))]"
                    )}
                  >
                    {m.tipo === "ingreso" ? "+" : "−"}
                    {pesos(m.monto)}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitar(m.id)}
                    aria-label="Borrar movimiento"
                    className="shrink-0 rounded-full p-1 text-muted-foreground/40 transition-colors hover:bg-secondary hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Tarjeta>
  );
}
