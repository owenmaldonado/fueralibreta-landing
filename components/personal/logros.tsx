"use client";

import * as React from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  desbloquearLogros, obtenerDias, obtenerHabitos, obtenerLogros, obtenerMovimientos,
  obtenerObjetivos, obtenerPuntosTotales, obtenerRegistros, obtenerSesiones,
} from "@/lib/personal/api";
import { hoy, sumarDias } from "@/lib/personal/fechas";
import { contarRecords } from "@/lib/personal/gym";
import { LOGROS, logrosNuevos, type ContextoLogros, type Logro } from "@/lib/personal/logros";
import { nivelDe } from "@/lib/personal/reglas";
import type { ISODate, RegistroHabito } from "@/lib/personal/tipos";
import { AnilloProgreso, EstadoVacio, Tarjeta, TituloTarjeta } from "./piezas";
import { EncabezadoPantalla } from "./shell";

/** Ventana de historial que se evalúa. Dos años cubre de sobra cualquier logro del catálogo. */
const DIAS_EVALUADOS = 730;

const FAMILIAS: { clave: Logro["familia"]; etiqueta: string }[] = [
  { clave: "constancia", etiqueta: "Constancia" },
  { clave: "cuerpo", etiqueta: "Cuerpo" },
  { clave: "mente", etiqueta: "Mente" },
  { clave: "dinero", etiqueta: "Dinero" },
  { clave: "rumbo", etiqueta: "Rumbo" },
];

export function PantallaLogros() {
  const [ctx, setCtx] = React.useState<ContextoLogros | null>(null);
  const [desbloqueados, setDesbloqueados] = React.useState<Map<string, ISODate>>(new Map());
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    let vivo = true;
    const desde = sumarDias(hoy(), -DIAS_EVALUADOS);
    const hasta = hoy();
    const anio = new Date().getFullYear();

    (async () => {
      try {
        const [dias, habitos, registros, sesiones, movimientos, objetivos, puntos, yaTengo] = await Promise.all([
          obtenerDias(desde, hasta),
          obtenerHabitos(true),
          obtenerRegistros(desde, hasta),
          obtenerSesiones(desde, hasta),
          obtenerMovimientos(desde, hasta),
          obtenerObjetivos(anio),
          obtenerPuntosTotales(),
          obtenerLogros(),
        ]);
        if (!vivo) return;

        const registrosPorHabito = new Map<string, Map<ISODate, RegistroHabito>>();
        for (const r of registros) {
          let m = registrosPorHabito.get(r.habitoId);
          if (!m) {
            m = new Map();
            registrosPorHabito.set(r.habitoId, m);
          }
          m.set(r.fecha, r);
        }

        const contexto: ContextoLogros = {
          habitos,
          registrosPorHabito,
          dias,
          sesionesGym: sesiones.map((s) => ({ fecha: s.fecha })),
          movimientos,
          objetivos,
          puntosTotales: puntos,
          recordsRotos: contarRecords(sesiones),
        };
        setCtx(contexto);

        const yaMap = new Map(yaTengo.map((l) => [l.clave, l.fechaDesbloqueo]));
        // Los logros se evalúan aquí, no con un trigger en la base: la
        // condición vive en TypeScript, y agregar un logro nuevo tiene que
        // poder desbloquearse con historial viejo sin escribir una migración.
        const nuevos = logrosNuevos(contexto, new Set(yaMap.keys()));
        if (nuevos.length > 0) {
          await desbloquearLogros(nuevos);
          const hoyISO = hoy();
          for (const clave of nuevos) yaMap.set(clave, hoyISO);
          const primero = LOGROS.find((l) => l.clave === nuevos[0]);
          toast.success(
            nuevos.length === 1
              ? `¡Logro desbloqueado! ${primero?.icono ?? ""} ${primero?.nombre ?? ""}`
              : `¡${nuevos.length} logros desbloqueados!`
          );
        }
        if (vivo) setDesbloqueados(yaMap);
      } catch (err) {
        console.error("No se pudieron cargar los logros:", err);
        if (vivo) toast.error(err instanceof Error ? err.message : "No se pudieron cargar los logros");
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  const nivel = nivelDe(ctx?.puntosTotales ?? 0);
  const total = LOGROS.length;
  const conseguidos = desbloqueados.size;

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPantalla titulo="Logros" descripcion="Lo que llevas acumulado, sin que se te olvide" />

      <Tarjeta>
        <div className="flex items-center gap-4">
          <AnilloProgreso porcentaje={nivel.progreso} tamano={92} grosor={8}>
            <span className="mid-etiqueta text-[8px]">Nivel</span>
            <span className="mid-num mid-display text-[26px] leading-none">{nivel.nivel}</span>
          </AnilloProgreso>
          <div className="min-w-0 flex-1">
            <p className="mid-titulo text-[22px]">{nivel.nombre}</p>
            <p className="mid-num mt-1 text-[13px] text-muted-foreground">
              {nivel.puntosTotales.toLocaleString("es-MX")} puntos en total
            </p>
            <p className="mid-num mt-0.5 text-[12px] text-muted-foreground">
              Faltan {nivel.puntosParaSiguiente} para el nivel {nivel.nivel + 1}
            </p>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta>
        <TituloTarjeta
          accion={
            <span className="mid-num text-[12px] font-semibold text-muted-foreground">
              {conseguidos} de {total}
            </span>
          }
        >
          Insignias
        </TituloTarjeta>

        {cargando ? (
          <EstadoVacio>Revisando tu historial…</EstadoVacio>
        ) : (
          <div className="flex flex-col gap-5">
            {FAMILIAS.map((familia) => {
              const dellFamilia = LOGROS.filter((l) => l.familia === familia.clave);
              return (
                <div key={familia.clave}>
                  <p className="mid-etiqueta mb-2">{familia.etiqueta}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {dellFamilia.map((logro) => (
                      <Insignia
                        key={logro.clave}
                        logro={logro}
                        fecha={desbloqueados.get(logro.clave) ?? null}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Tarjeta>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Los puntos se ganan cumpliendo hábitos: fácil 5, media 10, difícil 20. Un hábito no cumplido pero con motivo
        anotado da 0 puntos y no rompe la racha; sin motivo, la rompe. Cada 500 puntos subes de nivel.
      </p>
    </div>
  );
}

function Insignia({ logro, fecha }: { logro: Logro; fecha: ISODate | null }) {
  const abierto = fecha !== null;
  return (
    <div
      title={logro.descripcion}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors",
        abierto ? "border-primary/40 bg-primary/10" : "border-border"
      )}
    >
      <span className={cn("text-2xl leading-none", !abierto && "opacity-25 grayscale")} aria-hidden>
        {abierto ? logro.icono : <Lock className="h-6 w-6" />}
      </span>
      <span className={cn("text-[12px] font-semibold leading-tight", !abierto && "text-muted-foreground")}>
        {logro.nombre}
      </span>
      <span className="text-[10px] leading-tight text-muted-foreground">
        {abierto ? fecha : logro.descripcion}
      </span>
    </div>
  );
}
