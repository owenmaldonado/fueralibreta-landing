"use client";

import * as React from "react";
import Link from "next/link";
import { Boxes, Settings, ChevronRight, ArrowRight, Copy, Check, MessageCircle, History, Users, Scissors, ClipboardCheck } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { LoadingBlock } from "@/components/app-shell/loading";
import { Button } from "@/components/ui/button";
import { BloqueoPlan } from "@/components/dashboards/bloqueo-plan";
import { useSession } from "@/lib/session";
import { usePlan } from "@/lib/planes";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ADMIN_EMAIL } from "@/lib/admin-data";
import { getEmpleadoActual } from "@/lib/empleados";

// Fonda y Abarrotera. Aquí SOLO va lo que de verdad aplica a esos dos giros.
//
// Antes esta lista traía también Productos y Configuración, y los dos
// llevaban a pantallas pensadas para barbería: "Productos" es el inventario
// de insumos del barbero (una fonda tiene Menú y una abarrotera tiene
// Inventario), y "Configuración" son horarios, excepciones y servicios de
// corte. Owen: "hay 2 opciones que se repiten y de una dan error... no
// sirve de nada". Un botón que lleva a un error es peor que no tenerlo.
//
// Cierres se movió a Mi Plan (ver app/app/mi-plan/page.tsx): esa sección ya
// es solo del dueño, así que no hace falta esconderla por rol dos veces.
const LINKS = [
  { href: "/app/empleados", label: "Empleados", desc: "Multiusuario con PIN", icon: Users },
];

// Orden pensado para que lo más usado en el día a día quede arriba: Servicios
// (duplicado del tab de Configuración, ver app/app/configuracion/page.tsx)
// queda primero porque hoy solo se llega a él entrando a Configuración.
const LINKS_BARBERIA = [
  { href: "/app/configuracion?tab=servicios", label: "Servicios", desc: "Cortes, precios y duración", icon: Scissors },
  { href: "/app/productos", label: "Productos", desc: "Inventario de insumos", icon: Boxes },
  { href: "/app/configuracion", label: "Configuración", desc: "Horarios, excepciones y servicios", icon: Settings },
  { href: "/app/empleados", label: "Empleados", desc: "Multiusuario con PIN", icon: Users },
  { href: "/app/historial", label: "Historial", desc: "Citas de días anteriores", icon: History },
];

/** Mismo criterio que middleware.ts (RUTAS_SOLO_DUENO/RUTAS_SOLO_DUENO_O_ENCARGADO): oculta lo que esa ruta igual va a rebotar. */
function linkVisible(href: string, rol: "dueno" | "encargado" | "vendedor"): boolean {
  // Mismas rutas que RUTAS_SOLO_DUENO en middleware.ts. Gastos/Caja
  // (reportes) entraron ahí, pero desde /app/mas no se llega a ellas, así
  // que no hace falta filtrarlas aquí — quien las esconde es BottomNav.
  const soloDueno =
    href.startsWith("/app/configuracion") || href.startsWith("/app/empleados") || href.startsWith("/app/cortes");
  if (soloDueno) return rol === "dueno";
  // /app/productos ya NO se le esconde al vendedor: ajustar inventario es
  // parte de su trabajo cuando le dejan la tienda sola (ver
  // PERMISOS.vendedor.ajustarInventario en lib/empleados.ts y la lista
  // vacía RUTAS_SOLO_DUENO_O_ENCARGADO en middleware.ts).
  return true;
}

export default function MasPage() {
  const { session, ready } = useSession();
  const plan = usePlan();
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  const [copiado, setCopiado] = React.useState(false);
  // Empleados/Configuración ya están bloqueados por middleware.ts para
  // cualquier no-dueño, y Productos para vendedor — pero antes de este
  // cambio /app/mas seguía mostrando esos links igual, así que tocarlos
  // primero rebotaba con un toast en vez de simplemente no aparecer. Se
  // resuelve en un efecto (getEmpleadoActual lee una cookie) para no
  // desalinear el primer render del servidor con el del cliente — mismo
  // criterio que puedeBorrar en app/app/pedidos/page.tsx.
  const [rolActual, setRolActual] = React.useState<"dueno" | "encargado" | "vendedor">("dueno");

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => {
      setIsAdmin(data.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    });
  }, []);

  React.useEffect(() => {
    setRolActual(getEmpleadoActual()?.rol ?? "dueno");
  }, []);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!ready || !session) return <LoadingBlock />;

  const esBarberia = session.business.tipo === "barberia";
  const linkReservas = esBarberia && origin ? `${origin}/b/${session.business.slug}` : "";

  function copiarLink() {
    if (!linkReservas) return;
    navigator.clipboard.writeText(linkReservas).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <>
      <PageHeader title="Más" />
      <div className="flex flex-col gap-2 px-4 pb-6">
        {isAdmin && (
          <Link
            href="/admin"
            className="mb-2 block overflow-hidden rounded-2xl border-2 border-purple-500/50 bg-gradient-to-br from-purple-950 via-purple-900 to-black p-6 shadow-[0_0_45px_-10px_rgba(168,85,247,0.6)] transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-purple-500/20 text-3xl">
                👑
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-bold leading-tight text-white">👑 Panel de Dios</p>
                <p className="mt-1 text-sm text-purple-200">Eres admin · Gestionar usuarios y negocios</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-purple-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-purple-400">
              Entrar a /admin
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        )}

        {esBarberia && (
          <BloqueoPlan
            activo={plan.giroBarberia.reservas}
            blur
            titulo="Reservas en línea es de Pro"
            texto="Deja que tus clientes agenden solos con un link"
          >
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">Link de reservas{session.business.demo ? " (Demo)" : ""}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Tus clientes agendan solos, sin necesitar cuenta</p>
              <div className="mt-3 truncate rounded-lg bg-secondary px-3 py-2 font-mono text-xs text-muted-foreground">
                {linkReservas || "Cargando..."}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={copiarLink} disabled={!linkReservas}>
                  {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiado ? "¡Copiado!" : "Copiar"}
                </Button>
                <Button asChild variant="ledger" size="sm" className="flex-1">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Agenda tu cita en ${session.business.nombre}: ${linkReservas}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" /> Compartir
                  </a>
                </Button>
              </div>
            </div>
          </BloqueoPlan>
        )}

        {rolActual !== "dueno" && (
          <p className="px-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Solo propietario: Configuración/Empleados{rolActual === "vendedor" ? "/Productos" : ""} ocultos
          </p>
        )}
        {(esBarberia ? LINKS_BARBERIA : LINKS).filter((l) => linkVisible(l.href, rolActual)).map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <l.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{l.label}</p>
              <p className="text-xs text-muted-foreground">{l.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </>
  );
}
