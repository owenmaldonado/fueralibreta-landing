"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { guardarAnio, guardarObjetivo, obtenerAnio, obtenerObjetivos } from "@/lib/personal/api";
import { CATEGORIAS_OBJETIVO } from "@/lib/personal/categorias";
import type { CategoriaObjetivo, Objetivo } from "@/lib/personal/tipos";
import { AreaTexto, CampoLinea } from "./campos";
import { IndicadorGuardado, Tarjeta, type EstadoGuardado } from "./piezas";
import { EncabezadoPantalla } from "./shell";

const RETARDO_MS = 800;

/**
 * Los objetivos del año, en las 7 categorías "estrella polar".
 *
 * No hay botón de guardar en toda la pantalla: se escribe y se guarda solo,
 * como en una libreta. El indicador de arriba es lo único que confirma.
 */
export function PantallaObjetivos() {
  const [anio, setAnio] = React.useState(() => new Date().getFullYear());
  const [textos, setTextos] = React.useState<Record<string, string>>({});
  const [logrados, setLogrados] = React.useState<Record<string, boolean>>({});
  const [palabra, setPalabra] = React.useState("");
  const [intencion, setIntencion] = React.useState("");
  const [estado, setEstado] = React.useState<EstadoGuardado>("inactivo");
  const [cargando, setCargando] = React.useState(true);

  const temporizadores = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  React.useEffect(() => {
    let vivo = true;
    setCargando(true);
    Promise.all([obtenerObjetivos(anio), obtenerAnio(anio)])
      .then(([objetivos, datosAnio]) => {
        if (!vivo) return;
        const t: Record<string, string> = {};
        const l: Record<string, boolean> = {};
        for (const o of objetivos as Objetivo[]) {
          t[o.categoria] = o.texto ?? "";
          l[o.categoria] = o.logrado;
        }
        setTextos(t);
        setLogrados(l);
        setPalabra(datosAnio?.palabra ?? "");
        setIntencion(datosAnio?.intencion ?? "");
      })
      .catch((err) => {
        console.error("No se pudieron cargar los objetivos:", err);
        if (vivo) toast.error("No se pudieron cargar los objetivos");
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [anio]);

  // Se limpian los temporizadores pendientes al salir, mandando lo que falte.
  const temporizadoresRef = temporizadores.current;
  React.useEffect(() => () => temporizadoresRef.forEach((t) => clearTimeout(t)), [temporizadoresRef]);

  function programar(clave: string, fn: () => Promise<void>) {
    const previo = temporizadores.current.get(clave);
    if (previo) clearTimeout(previo);
    temporizadores.current.set(
      clave,
      setTimeout(async () => {
        setEstado("guardando");
        try {
          await fn();
          setEstado("guardado");
        } catch (err) {
          console.error("No se pudo guardar:", err);
          setEstado("error");
          toast.error("No se pudo guardar");
        }
      }, RETARDO_MS)
    );
  }

  function escribirObjetivo(categoria: CategoriaObjetivo, texto: string) {
    setTextos((t) => ({ ...t, [categoria]: texto }));
    programar(categoria, () => guardarObjetivo(anio, categoria, { texto: texto.trim() || null }));
  }

  async function alternarLogrado(categoria: CategoriaObjetivo) {
    const siguiente = !logrados[categoria];
    setLogrados((l) => ({ ...l, [categoria]: siguiente }));
    setEstado("guardando");
    try {
      await guardarObjetivo(anio, categoria, { logrado: siguiente, texto: textos[categoria] ?? null });
      setEstado("guardado");
    } catch (err) {
      console.error("No se pudo guardar el objetivo:", err);
      setLogrados((l) => ({ ...l, [categoria]: !siguiente }));
      setEstado("error");
      toast.error("No se pudo guardar");
    }
  }

  const cumplidos = CATEGORIAS_OBJETIVO.filter((c) => logrados[c.clave]).length;
  const escritos = CATEGORIAS_OBJETIVO.filter((c) => (textos[c.clave] ?? "").trim()).length;

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPantalla titulo="El año" descripcion="Siete frentes y una palabra. Nada más." />

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Año anterior"
          onClick={() => setAnio((a) => a - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="mid-titulo text-[24px]">{anio}</h2>
          <IndicadorGuardado estado={estado} />
        </div>
        <button
          type="button"
          aria-label="Año siguiente"
          onClick={() => setAnio((a) => a + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <Tarjeta className="text-center">
        <p className="mid-etiqueta">Tu palabra del año</p>
        <input
          value={palabra}
          onChange={(e) => {
            setPalabra(e.target.value);
            programar("__palabra", () => guardarAnio(anio, { palabra: e.target.value.trim() || null }));
          }}
          placeholder="una sola"
          maxLength={24}
          className="mid-titulo w-full bg-transparent py-2 text-center text-[38px] leading-tight outline-none placeholder:text-muted-foreground/25"
        />
        <div className="mx-auto max-w-sm border-t border-border pt-2">
          <CampoLinea
            valor={intencion}
            onChange={(v) => {
              setIntencion(v);
              programar("__intencion", () => guardarAnio(anio, { intencion: v.trim() || null }));
            }}
            placeholder="¿Por qué esa palabra?"
            className="text-center text-[13px] text-muted-foreground"
          />
        </div>
      </Tarjeta>

      {!cargando && (
        <p className="mid-num px-1 text-[12px] text-muted-foreground">
          {escritos} de 7 escritos · {cumplidos} logrados
        </p>
      )}

      <div className="flex flex-col gap-3">
        {CATEGORIAS_OBJETIVO.map((c) => {
          const logrado = Boolean(logrados[c.clave]);
          return (
            <Tarjeta key={c.clave} className={cn(logrado && "border-[hsl(var(--mid-cumplido))]/40")}>
              <div className="mb-2 flex items-center gap-2.5">
                <span className="text-lg leading-none" aria-hidden>
                  {c.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{c.etiqueta}</p>
                  <p className="text-[11px] text-muted-foreground">{c.pregunta}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Marcar ${c.etiqueta} como logrado`}
                  aria-pressed={logrado}
                  onClick={() => alternarLogrado(c.clave as CategoriaObjetivo)}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all active:scale-90",
                    logrado
                      ? "mid-pop border-transparent bg-[hsl(var(--mid-cumplido))] text-white"
                      : "border-border text-muted-foreground/50 hover:text-foreground"
                  )}
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>
              <AreaTexto
                valor={textos[c.clave] ?? ""}
                onChange={(v) => escribirObjetivo(c.clave as CategoriaObjetivo, v)}
                placeholder="Escríbelo como si se lo contaras a alguien…"
                serif
                className={cn(logrado && "line-through decoration-[hsl(var(--mid-cumplido))] decoration-1")}
              />
            </Tarjeta>
          );
        })}
      </div>
    </div>
  );
}
