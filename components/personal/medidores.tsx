"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { EstadoHabito, VisualHabito } from "@/lib/personal/tipos";

// ============================================================================
// MEDIDORES — cada hábito se dibuja distinto.
//
// Por qué SVG a mano y no iconos de librería: un icono es la MISMA figura
// prendida o apagada. Un medidor cuenta el avance dentro de la figura — el
// vaso se llena, la luna crece, los discos se apilan en la barra. Eso es lo
// que hace que dar el toque se sienta bien y que el tablero se lea de un
// vistazo, sin números.
//
// Contrato común: todos reciben progreso 0..1 y pintan lo "encendido" con
// currentColor (el color lo pone la tarjeta según el estado), y lo apagado con
// --mid-pendiente. Así los diez medidores se ven como una sola familia y
// cambian de color juntos sin tocar cada uno.
//
// Un `visual` desconocido cae al anillo. Ninguna clave rara puede romper la
// pantalla Hoy.
// ============================================================================

export interface PropsMedidor {
  /** 0..1. Un hábito binario cumplido llega como 1. */
  progreso: number;
  estado: EstadoHabito;
  /** Lado del cuadro en píxeles. */
  tamano?: number;
}

const APAGADO = "hsl(var(--mid-pendiente))";

function limitar(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Marco común: cuadra el viewBox, aplica la transición suave y el halo cuando
 * el hábito quedó completo. El halo es lo único puramente decorativo del
 * archivo y se gana su lugar: es la recompensa visual del toque.
 */
function Marco({
  tamano = 64,
  completo,
  children,
}: {
  tamano?: number;
  completo: boolean;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={tamano}
      height={tamano}
      aria-hidden
      className={cn("overflow-visible transition-all duration-500", completo && "mid-halo")}
    >
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 1. VASOS — vasitos que se llenan de verdad
// ---------------------------------------------------------------------------

/**
 * Hasta 8 vasos en dos hileras. Cada vaso es un trapecio (más ancho arriba,
 * como un vaso real) y el líquido tiene la superficie ondulada, no una línea
 * recta: es la diferencia entre "una barra dentro de un contorno" y "agua".
 */
function Vasos({ progreso, tamano, estado }: PropsMedidor & { total?: number }) {
  const p = limitar(progreso);
  const TOTAL = 8;
  const llenos = p * TOTAL;

  const ANCHO = 12;
  const ALTO = 21;
  const GAP_X = 2.6;
  const GAP_Y = 5;
  const PORFILA = 4;

  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      {Array.from({ length: TOTAL }, (_, i) => {
        const fila = Math.floor(i / PORFILA);
        const col = i % PORFILA;
        const x = 3 + col * (ANCHO + GAP_X);
        const y = 8 + fila * (ALTO + GAP_Y);
        // Cuánto de ESTE vaso está lleno: los anteriores al 100%, el actual la
        // fracción, los siguientes vacíos.
        const nivel = limitar(llenos - i);
        const idClip = `mid-vaso-${i}`;
        // Trapecio: arriba ancho, abajo un poco más angosto.
        const forma = `M${x},${y} L${x + ANCHO},${y} L${x + ANCHO - 1.6},${y + ALTO} L${x + 1.6},${y + ALTO} Z`;
        // La superficie del agua, con una onda suave.
        const superficie = y + ALTO - nivel * ALTO;

        return (
          <g key={i}>
            <clipPath id={idClip}>
              <path d={forma} />
            </clipPath>
            {nivel > 0 && (
              <g clipPath={`url(#${idClip})`}>
                <path
                  d={
                    `M${x - 2},${superficie + 1.2} ` +
                    `q${ANCHO / 4},-2.4 ${ANCHO / 2},0 ` +
                    `t${ANCHO / 2},0 t${ANCHO / 2},0 ` +
                    `V${y + ALTO + 2} H${x - 2} Z`
                  }
                  fill="currentColor"
                  opacity={0.9}
                  className="transition-all duration-500"
                />
              </g>
            )}
            <path
              d={forma}
              fill="none"
              stroke={nivel > 0 ? "currentColor" : APAGADO}
              strokeWidth={1.8}
              strokeLinejoin="round"
              className="transition-colors duration-500"
            />
          </g>
        );
      })}
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// 2. LUNA — de luna nueva a luna llena
// ---------------------------------------------------------------------------

/**
 * La fase se dibuja con el truco clásico: media circunferencia fija más una
 * elipse "terminador" cuyo radio horizontal va de +r (luna nueva) a -r (luna
 * llena). Cuando el radio cruza cero, se invierte el sentido del arco y la
 * parte iluminada pasa de creciente a gibosa sola.
 */
function Luna({ progreso, tamano, estado }: PropsMedidor) {
  const p = limitar(progreso);
  const r = 21;
  const cx = 32;
  const cy = 33;
  const rx = Math.abs(r * (1 - 2 * p));
  const sentido = p < 0.5 ? 1 : 0;
  const iluminada = `M${cx},${cy - r} A${r},${r} 0 0 1 ${cx},${cy + r} A${rx},${r} 0 0 ${sentido} ${cx},${cy - r} Z`;

  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      {/* Estrellitas: no son decoración gratuita, dan escala a la luna y
          hacen que una luna nueva (casi invisible) siga leyéndose como noche. */}
      <circle cx={9} cy={12} r={1.3} fill="currentColor" opacity={0.35 + p * 0.45} />
      <circle cx={55} cy={17} r={1} fill="currentColor" opacity={0.25 + p * 0.45} />
      <circle cx={51} cy={7} r={1.5} fill="currentColor" opacity={0.3 + p * 0.5} />

      <circle cx={cx} cy={cy} r={r} fill="none" stroke={APAGADO} strokeWidth={1.8} />
      {p > 0.01 && <path d={iluminada} fill="currentColor" className="transition-all duration-500" />}
      {/* Cráteres, solo cuando ya hay luna que verlos. */}
      {p > 0.6 && (
        <g opacity={0.18} fill="hsl(var(--background))">
          <circle cx={cx + 6} cy={cy - 6} r={3.2} />
          <circle cx={cx - 2} cy={cy + 7} r={2.2} />
          <circle cx={cx + 9} cy={cy + 6} r={1.6} />
        </g>
      )}
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// 3. PESAS — la barra se carga de discos
// ---------------------------------------------------------------------------

/** Tres pares de discos que van apareciendo del centro hacia afuera. */
function Pesas({ progreso, tamano, estado }: PropsMedidor) {
  const p = limitar(progreso);
  const puestos = Math.round(p * 3);
  const DISCOS = [
    { dx: 13, alto: 26 },
    { dx: 8.5, alto: 20 },
    { dx: 4.5, alto: 14 },
  ];

  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      {/* Barra */}
      <rect x={12} y={30} width={40} height={4} rx={2} fill={p > 0 ? "currentColor" : APAGADO} className="transition-colors duration-500" />
      {/* Topes */}
      <rect x={9} y={26} width={3.5} height={12} rx={1.6} fill={p > 0 ? "currentColor" : APAGADO} className="transition-colors duration-500" />
      <rect x={51.5} y={26} width={3.5} height={12} rx={1.6} fill={p > 0 ? "currentColor" : APAGADO} className="transition-colors duration-500" />

      {DISCOS.map((disco, i) => {
        const activo = i < puestos;
        return (
          <g
            key={i}
            className="transition-all duration-500"
            style={{ opacity: activo ? 1 : 0.2, transform: activo ? "scaleY(1)" : "scaleY(0.35)", transformOrigin: "32px 32px" }}
          >
            <rect
              x={32 - disco.dx - 3.2}
              y={32 - disco.alto / 2}
              width={6.4}
              height={disco.alto}
              rx={2.4}
              fill={activo ? "currentColor" : APAGADO}
            />
            <rect
              x={32 + disco.dx - 3.2}
              y={32 - disco.alto / 2}
              width={6.4}
              height={disco.alto}
              rx={2.4}
              fill={activo ? "currentColor" : APAGADO}
            />
          </g>
        );
      })}
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// 4. LIBRO — las páginas se llenan
// ---------------------------------------------------------------------------

/** Libro abierto; el avance sube como tinta desde abajo, recortado a las dos páginas. */
function Libro({ progreso, tamano, estado }: PropsMedidor) {
  const p = limitar(progreso);
  const ARRIBA = 16;
  const ABAJO = 48;
  const nivel = ABAJO - p * (ABAJO - ARRIBA);

  // Dos páginas que se curvan hacia el lomo central.
  const izquierda = "M31,20 C24,15 15,14 8,16 L8,45 C15,43 24,44 31,49 Z";
  const derecha = "M33,20 C40,15 49,14 56,16 L56,45 C49,43 40,44 33,49 Z";

  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      <clipPath id="mid-libro-clip">
        <path d={izquierda} />
        <path d={derecha} />
      </clipPath>
      <g clipPath="url(#mid-libro-clip)">
        <rect x={0} y={nivel} width={64} height={64} fill="currentColor" opacity={0.85} className="transition-all duration-500" />
      </g>
      <path d={izquierda} fill="none" stroke={p > 0 ? "currentColor" : APAGADO} strokeWidth={1.8} strokeLinejoin="round" className="transition-colors duration-500" />
      <path d={derecha} fill="none" stroke={p > 0 ? "currentColor" : APAGADO} strokeWidth={1.8} strokeLinejoin="round" className="transition-colors duration-500" />
      {/* Lomo */}
      <path d="M32,20 L32,49" stroke={p > 0 ? "currentColor" : APAGADO} strokeWidth={1.8} strokeLinecap="round" className="transition-colors duration-500" />
      {/* Renglones, solo en la parte que todavía no se "lee". */}
      <g stroke={APAGADO} strokeWidth={1.1} strokeLinecap="round" opacity={0.55}>
        <path d="M13,24 L27,25.5" />
        <path d="M13,30 L27,31" />
        <path d="M37,25.5 L51,24" />
        <path d="M37,31 L51,30" />
      </g>
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// 5. PLANTA — crece con el avance
// ---------------------------------------------------------------------------

/**
 * El tallo se dibuja solo (stroke-dashoffset sobre pathLength=1) y las hojas
 * aparecen en umbrales. Es el medidor con más "premio" al completarse: sale la
 * flor. Va bien para hábitos de constancia lenta (meditar, escribir).
 */
function Planta({ progreso, tamano, estado }: PropsMedidor) {
  const p = limitar(progreso);
  const hoja = (n: number) => (p >= n ? 1 : 0);

  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      {/* Maceta */}
      <path
        d="M20,46 L44,46 L41,58 Q41,60 39,60 L25,60 Q23,60 23,58 Z"
        fill={APAGADO}
        opacity={0.55}
      />
      <rect x={18} y={42} width={28} height={5} rx={2.4} fill={APAGADO} opacity={0.8} />

      {/* Tallo */}
      <path
        d="M32,45 C32,38 31,32 32,26 C33,21 32,17 32,13"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - p}
        className="transition-all duration-700"
      />

      {/* Hojas: aparecen a 1/3 y 2/3 del camino. */}
      <path
        d="M32,36 C25,36 21,32 21,28 C27,27 31,30 32,36 Z"
        fill="currentColor"
        className="transition-all duration-500"
        style={{ opacity: hoja(0.3), transform: `scale(${0.4 + hoja(0.3) * 0.6})`, transformOrigin: "32px 34px" }}
      />
      <path
        d="M32,28 C39,28 43,24 43,20 C37,19 33,22 32,28 Z"
        fill="currentColor"
        className="transition-all duration-500"
        style={{ opacity: hoja(0.62), transform: `scale(${0.4 + hoja(0.62) * 0.6})`, transformOrigin: "32px 26px" }}
      />

      {/* La flor solo sale al completar: es el premio. */}
      <g
        className="transition-all duration-500"
        style={{ opacity: hoja(1), transform: `scale(${0.2 + hoja(1) * 0.8})`, transformOrigin: "32px 12px" }}
      >
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx={32} cy={7.5} rx={2.6} ry={4.4} fill="currentColor" transform={`rotate(${a} 32 12)`} />
        ))}
        <circle cx={32} cy={12} r={2.6} fill="hsl(var(--background))" />
      </g>
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// 6. ESCUDO — para hábitos de "no hacer"
// ---------------------------------------------------------------------------

/**
 * "Sin celular en la cama", "no fumar": esos no se CUMPLEN, se AGUANTAN. Un
 * check no cuenta esa historia; un escudo que se sella, sí.
 */
function Escudo({ progreso, tamano, estado }: PropsMedidor) {
  const p = limitar(progreso);
  const forma = "M32,6 L52,14 L52,32 C52,44 43,53 32,58 C21,53 12,44 12,32 L12,14 Z";
  const nivel = 58 - p * 52;

  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      <clipPath id="mid-escudo-clip">
        <path d={forma} />
      </clipPath>
      <g clipPath="url(#mid-escudo-clip)">
        <rect x={0} y={nivel} width={64} height={64} fill="currentColor" opacity={0.85} className="transition-all duration-500" />
      </g>
      <path d={forma} fill="none" stroke={p > 0 ? "currentColor" : APAGADO} strokeWidth={2.2} strokeLinejoin="round" className="transition-colors duration-500" />
      {p >= 1 && (
        <path
          d="M22,32 L29,39 L43,25"
          fill="none"
          stroke="hsl(var(--background))"
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          className="mid-trazar"
        />
      )}
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// 7. LLAMA — crece con el avance
// ---------------------------------------------------------------------------

function Llama({ progreso, tamano, estado }: PropsMedidor) {
  const p = limitar(progreso);
  const forma = "M32,6 C38,17 47,21 47,34 C47,44 40,52 32,52 C24,52 17,44 17,34 C17,25 23,22 26,15 C28,21 30,22 32,26 C33,20 32,13 32,6 Z";
  const nivel = 52 - p * 46;

  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      <clipPath id="mid-llama-clip">
        <path d={forma} />
      </clipPath>
      <g clipPath="url(#mid-llama-clip)">
        <rect x={0} y={nivel} width={64} height={64} fill="currentColor" opacity={0.9} className="transition-all duration-500" />
      </g>
      <path d={forma} fill="none" stroke={p > 0 ? "currentColor" : APAGADO} strokeWidth={2.2} strokeLinejoin="round" className="transition-colors duration-500" />
      {/* Corazón de la llama: aparece cuando ya va más de la mitad. */}
      {p > 0.5 && (
        <path
          d="M32,32 C35,37 37,40 37,44 C37,47.5 34.8,50 32,50 C29.2,50 27,47.5 27,44 C27,40 29,37 32,32 Z"
          fill="hsl(var(--background))"
          opacity={0.35}
        />
      )}
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// 8. BARRAS — cinco barras que suben (genérico cuantitativo)
// ---------------------------------------------------------------------------

function Barras({ progreso, tamano, estado }: PropsMedidor) {
  const p = limitar(progreso);
  const encendidas = p * 5;
  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      {[0, 1, 2, 3, 4].map((i) => {
        const alto = 12 + i * 8;
        const x = 8 + i * 10;
        const activa = encendidas > i;
        const parcial = limitar(encendidas - i);
        return (
          <g key={i}>
            <rect x={x} y={54 - alto} width={7.5} height={alto} rx={3} fill={APAGADO} />
            <rect
              x={x}
              y={54 - alto * parcial}
              width={7.5}
              height={alto * parcial}
              rx={3}
              fill="currentColor"
              className="transition-all duration-500"
              opacity={activa ? 1 : 0}
            />
          </g>
        );
      })}
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// 9. ANILLO — el genérico, estilo anillo de actividad
// ---------------------------------------------------------------------------

function Anillo({ progreso, tamano, estado }: PropsMedidor) {
  const p = limitar(progreso);
  const r = 23;
  const circ = 2 * Math.PI * r;
  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      <circle cx={32} cy={32} r={r} fill="none" stroke={APAGADO} strokeWidth={7} />
      <circle
        cx={32}
        cy={32}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={`${p * circ} ${circ}`}
        transform="rotate(-90 32 32)"
        className="transition-all duration-500"
      />
      {p >= 1 && (
        <path
          d="M22,32 L29,39 L43,24"
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          className="mid-trazar"
        />
      )}
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// 10. CHECK — el más sobrio, para hábitos que no piden metáfora
// ---------------------------------------------------------------------------

function Palomita({ progreso, tamano, estado }: PropsMedidor) {
  const p = limitar(progreso);
  const completo = p >= 1;
  return (
    <Marco tamano={tamano} completo={estado === "cumplido"}>
      <rect
        x={9}
        y={9}
        width={46}
        height={46}
        rx={15}
        fill={completo ? "currentColor" : "none"}
        stroke={completo ? "currentColor" : APAGADO}
        strokeWidth={2.6}
        className="transition-all duration-500"
      />
      <path
        d="M21,32.5 L29,40.5 L44,24"
        fill="none"
        stroke={completo ? "hsl(var(--background))" : APAGADO}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={completo ? 0 : 1}
        className={cn("transition-all duration-500", completo && "mid-trazar")}
      />
    </Marco>
  );
}

// ---------------------------------------------------------------------------

const MEDIDORES: Record<VisualHabito, React.ComponentType<PropsMedidor>> = {
  vasos: Vasos,
  luna: Luna,
  pesas: Pesas,
  libro: Libro,
  planta: Planta,
  escudo: Escudo,
  llama: Llama,
  barras: Barras,
  anillo: Anillo,
  check: Palomita,
};

/**
 * Color propio de cada medidor mientras el hábito va EN PROGRESO. El agua se ve
 * azul, la planta verde, la llama naranja — un vaso a medio llenar en ámbar no
 * se lee como agua.
 *
 * Los colores de ESTADO (verde cumplido, naranja justificado, rojo fallado)
 * siempre ganan sobre esto: el color natural solo se usa mientras el hábito
 * sigue pendiente, para que el tablero nunca mienta sobre cómo va el día.
 */
export const COLOR_NATURAL: Record<VisualHabito, string> = {
  vasos: "hsl(199 89% 58%)",
  luna: "hsl(245 72% 72%)",
  pesas: "hsl(var(--primary))",
  libro: "hsl(28 80% 62%)",
  planta: "hsl(140 55% 52%)",
  escudo: "hsl(265 62% 68%)",
  llama: "hsl(18 90% 60%)",
  barras: "hsl(var(--primary))",
  anillo: "hsl(var(--primary))",
  check: "hsl(var(--primary))",
};

/** Catálogo para el selector del editor de hábitos. */
export const CATALOGO_MEDIDORES: { clave: VisualHabito; etiqueta: string; pista: string }[] = [
  { clave: "vasos", etiqueta: "Vasos", pista: "Agua, café, litros" },
  { clave: "luna", etiqueta: "Luna", pista: "Dormir, descansar" },
  { clave: "pesas", etiqueta: "Pesas", pista: "Gym, fuerza" },
  { clave: "libro", etiqueta: "Libro", pista: "Leer, estudiar" },
  { clave: "planta", etiqueta: "Planta", pista: "Meditar, escribir" },
  { clave: "escudo", etiqueta: "Escudo", pista: "Lo que quieres evitar" },
  { clave: "llama", etiqueta: "Llama", pista: "Correr, energía" },
  { clave: "barras", etiqueta: "Barras", pista: "Cualquier cosa con meta" },
  { clave: "anillo", etiqueta: "Anillo", pista: "El genérico" },
  { clave: "check", etiqueta: "Palomita", pista: "Sin metáfora" },
];

export function Medidor({
  visual,
  progreso,
  estado,
  tamano,
}: PropsMedidor & { visual: VisualHabito }) {
  const Componente = MEDIDORES[visual] ?? Anillo;
  return <Componente progreso={progreso} estado={estado} tamano={tamano} />;
}
