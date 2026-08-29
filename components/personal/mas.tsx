"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarDays, ChevronRight, Download, HeartPulse, Loader2, Moon, NotebookPen, Sun, Target, Trophy,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  obtenerAnio, obtenerDias, obtenerEventos, obtenerHabitos, obtenerLogros, obtenerMovimientos,
  obtenerNotas, obtenerObjetivos, obtenerRegistros, obtenerSesiones,
} from "@/lib/personal/api";
import { hoy, sumarDias } from "@/lib/personal/fechas";
import { Tarjeta, TituloTarjeta } from "./piezas";
import { EncabezadoPantalla } from "./shell";
import { useTemaMiDia } from "./tema";

const DESTINOS = [
  { href: "/app/mi-dia/calendario", Icono: CalendarDays, titulo: "El año", detalle: "Los 12 meses de un vistazo" },
  { href: "/app/mi-dia/animo", Icono: HeartPulse, titulo: "Ánimo", detalle: "Cómo te has sentido y con qué se junta" },
  { href: "/app/mi-dia/logros", Icono: Trophy, titulo: "Logros", detalle: "Nivel, puntos e insignias" },
  { href: "/app/mi-dia/objetivos", Icono: Target, titulo: "Objetivos del año", detalle: "Siete frentes y tu palabra" },
  { href: "/app/mi-dia/notas", Icono: NotebookPen, titulo: "Notas", detalle: "Lo que no cabe en un día" },
];

/** Todo el historial que se exporta. 10 años es "todo" para efectos prácticos. */
const DIAS_EXPORTABLES = 3650;

export function PantallaMas() {
  const { tema, alternar } = useTemaMiDia();
  const [exportando, setExportando] = React.useState(false);

  /**
   * Descarga TODO en un JSON. No es una función de respaldo escondida: es la
   * promesa de que estos datos son tuyos y puedes llevártelos el día que esta
   * app se mude a su propio proyecto (o deje de existir).
   */
  async function exportar() {
    setExportando(true);
    try {
      const hasta = hoy();
      const desde = sumarDias(hasta, -DIAS_EXPORTABLES);
      const anio = new Date().getFullYear();
      const [dias, habitos, registros, eventos, movimientos, sesiones, logros, objetivos, datosAnio, notas] =
        await Promise.all([
          obtenerDias(desde, hasta),
          obtenerHabitos(true),
          obtenerRegistros(desde, hasta),
          obtenerEventos(desde, hasta),
          obtenerMovimientos(desde, hasta),
          obtenerSesiones(desde, hasta),
          obtenerLogros(),
          obtenerObjetivos(anio),
          obtenerAnio(anio),
          obtenerNotas(),
        ]);

      const contenido = JSON.stringify(
        { exportadoEn: new Date().toISOString(), dias, habitos, registros, eventos, movimientos, sesiones, logros, objetivos, anio: datosAnio, notas },
        null,
        2
      );

      const url = URL.createObjectURL(new Blob([contenido], { type: "application/json" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `mi-dia-${hasta}.json`;
      enlace.click();
      // Sin revoke, el Blob se queda en memoria hasta recargar la página.
      URL.revokeObjectURL(url);
      toast.success("Descargado");
    } catch (err) {
      console.error("No se pudo exportar:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPantalla titulo="Más" />

      <div className="flex flex-col gap-2">
        {DESTINOS.map(({ href, Icono, titulo, detalle }) => (
          <Link
            key={href}
            href={href}
            className="mid-tarjeta flex items-center gap-3.5 p-4 transition-colors hover:border-primary/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icono className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{titulo}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{detalle}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <Tarjeta>
        <TituloTarjeta>Apariencia</TituloTarjeta>
        <button
          type="button"
          onClick={alternar}
          className="flex w-full items-center gap-3.5 rounded-lg p-1 text-left transition-colors hover:bg-secondary/60"
        >
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              tema === "oscuro" ? "bg-secondary text-foreground" : "bg-primary/10 text-primary"
            )}
          >
            {tema === "oscuro" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">
              {tema === "oscuro" ? "Modo noche" : "Modo papel"}
            </span>
            <span className="block text-[12px] text-muted-foreground">
              Toca para cambiar a {tema === "oscuro" ? "papel (claro)" : "noche (oscuro)"}
            </span>
          </span>
        </button>
      </Tarjeta>

      <Tarjeta>
        <TituloTarjeta>Tus datos</TituloTarjeta>
        <button
          type="button"
          onClick={exportar}
          disabled={exportando}
          className="flex w-full items-center gap-3.5 rounded-lg p-1 text-left transition-colors hover:bg-secondary/60 disabled:opacity-60"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
            {exportando ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Download className="h-[18px] w-[18px]" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Descargar todo</span>
            <span className="block text-[12px] text-muted-foreground">
              Un archivo JSON con días, hábitos, gym, dinero, notas y objetivos
            </span>
          </span>
        </button>
        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
          Todo esto vive en tablas <span className="font-mono">personal_*</span> de tu propio Supabase, separadas por
          completo de FueraLibreta y visibles solo para tu cuenta. El día que quieras mudar esta app a su propio
          proyecto, se lleva esas tablas y nada más.
        </p>
      </Tarjeta>
    </div>
  );
}
