"use client";

import * as React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SheetHeader, SheetFooter } from "@/components/ui/sheet";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { formatMoney } from "@/lib/mock";
import type { GrocerySale, GrocerySaleItem } from "@/lib/types";

/**
 * Editor de una venta de abarrotes ya cobrada (ajustar cantidades o quitar
 * líneas del ticket) — vive en Gastos/Ventas > "Solo Ventas" (ver
 * app/app/gastos/page.tsx), antes vivía en el tab "Ventas" de Inventario.
 * El stock NO se ajusta automáticamente al editar/borrar aquí (mismo
 * comportamiento de siempre): es solo corregir el ticket, no un
 * movimiento de inventario.
 */
export function VentaForm({
  venta,
  onClose,
  update,
}: {
  venta: GrocerySale;
  onClose: () => void;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [items, setItems] = React.useState<GrocerySaleItem[]>(venta.items);

  const total = items.reduce((acc, it) => acc + it.subtotal, 0);
  const puedeGuardar = items.length > 0;

  function cambiarCantidad(itemId: string, cantidad: number) {
    setItems((prev) =>
      cantidad <= 0
        ? prev.filter((it) => it.id !== itemId)
        : prev.map((it) => (it.id === itemId ? { ...it, cantidad, subtotal: cantidad * it.precioUnitario } : it))
    );
  }

  function quitar(itemId: string) {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  }

  function guardar() {
    if (!puedeGuardar) return;
    update((prev) => {
      const a = prev.abarrotes!;
      return {
        ...prev,
        abarrotes: { ...a, ventas: a.ventas.map((v) => (v.id === venta.id ? { ...v, items, total } : v)) },
      };
    });
    onClose();
  }

  return (
    <>
      <SheetHeader title="Editar venta" description="El stock no se ajusta automáticamente" onClose={onClose} />
      <div className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-center">Cant</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="max-w-[100px] whitespace-normal text-sm font-medium">{it.productoNombre}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(it.id, it.cantidad - 1)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary"
                      aria-label="Restar"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-4 text-center font-mono text-xs tabular-nums">{it.cantidad}</span>
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(it.id, it.cantidad + 1)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary"
                      aria-label="Sumar"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">{formatMoney(it.subtotal)}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => quitar(it.id)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="font-display text-xl font-bold">{formatMoney(total)}</span>
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
