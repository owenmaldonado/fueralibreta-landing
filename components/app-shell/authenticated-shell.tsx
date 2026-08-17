"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, Lock, UserCog, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/session";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useOnlineStatus } from "@/lib/use-online-status";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { Fab } from "./fab";
import { OfflineSalesNotice } from "./offline-sales-notice";
import { SalesSyncManager } from "./sales-sync-manager";
import { SplashScreen } from "./splash-screen";
import { Button } from "@/components/ui/button";
import { waLink, NUMERO_CONTACTO } from "@/lib/mock";
import { writePlanElegido } from "@/lib/demoPreview";
import { ADMIN_EMAIL, exitImpersonation } from "@/lib/admin-data";
import { BarberiaQuickAdd, BARBERIA_ACTIONS } from "@/components/quick-add/barberia-quick-add";
import { FondaQuickAdd, FONDA_ACTIONS } from "@/components/quick-add/fonda-quick-add";
import { AbarrotesQuickAdd, ABARROTES_ACTIONS } from "@/components/quick-add/abarrotes-quick-add";
import { getEmpleadoActual, setEmpleadoActual, clearEmpleadoActual, pinDuenoConfigurado } from "@/lib/empleados";
import type { EmpleadoActual } from "@/lib/types";

// Segmentos de /app/{segmento} que SÍ son del dueño de un negocio (barbería/
// fonda/abarrotes) y por lo tanto sí deben exigir sesión + negocio. Todo lo
// demás bajo /app/* es del dueño del SaaS: el hub (admin-hub, admin-dashboard)
// y cada módulo que cuelga de él (rentas, o el "lienzo en blanco" genérico de
// app/app/[slug]/page.tsx para cualquier app nueva). Se invierte la lista
// aquí — en vez de sumar cada módulo nuevo del hub a mano — porque esta sí es
// estable: solo cambia si se agrega una pantalla real de negocio.
const SEGMENTOS_DE_NEGOCIO = new Set([
  "agenda",
  "apartados",
  "caja",
  "clientes",
  "configuracion",
  "empleados",
  "fiados",
  "frutas-verdura",
  "gastos",
  "historial",
  "inicio",
  "inventario",
  "mas",
  "menu",
  "pedidos",
  "productos",
]);

function esRutaDeNegocio(pathname: string): boolean {
  if (pathname === "/app") return true;
  const segmento = pathname.split("/")[2];
  return SEGMENTOS_DE_NEGOCIO.has(segmento ?? "");
}

/**
 * Parte 3 de PWA — "solo se permite vender sin conexión": estas rutas son
 * 100% administración (alta de productos/platillos, ajustes, empleados,
 * reportes, cobranza de fiados/apartados existentes) y nunca son el camino
 * para cobrar una venta (eso vive en el FAB y en Agenda/Hoy, ver los 5
 * flujos marcados con ventaOffline en lib/session.ts) — se bloquean por
 * completo. Pantallas mixtas como /app/inventario, /app/productos,
 * /app/caja o /app/pedidos NO están aquí a propósito: ahí vive vender de
 * verdad, así que solo sus acciones administrativas se bloquean (el
 * guardia central de update() ya se encarga, con un toast al guardar).
 */
const RUTAS_BLOQUEADAS_SIN_CONEXION = new Set([
  "configuracion",
  "empleados",
  "gastos",
  "clientes",
  "fiados",
  "apartados",
  "frutas-verdura",
  "menu",
]);

function esRutaBloqueadaSinConexion(pathname: string): boolean {
  const segmento = pathname.split("/")[2];
  return RUTAS_BLOQUEADAS_SIN_CONEXION.has(segmento ?? "");
}

/**
 * Shell del negocio logueado: TopBar + banner de demo + FAB + BottomNav,
 * envolviendo el contenido de cada pantalla (children). Se usa tanto en
 * app/app/layout.tsx (para /app/*) como en <App /> (para "/" cuando ya hay
 * sesión, ver components/app/app.tsx).
 */
export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { session, ready, update } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [quickAdd, setQuickAdd] = React.useState<string | null>(null);
  const [banned, setBanned] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [impersonating, setImpersonating] = React.useState<{ adminEmail: string; targetEmail: string } | null>(null);
  const [exiting, setExiting] = React.useState(false);
  // Multiusuario (modo PIN, login OPCIONAL por sesión — nunca por venta ni
  // al abrir la app): el pill "Dueño"/"Atendiendo: X" y el icono de
  // Empleados en el header (ver TopBar/TurnoControl) son siempre visibles,
  // sin importar si el negocio tiene empleados dados de alta. pinDuenoSet
  // solo decide si volver a DUEÑO / entrar a Empleados pide el PIN maestro
  // (ver lib/empleados.ts) — un negocio de 1 persona que nunca lo
  // configura no ve ningún PIN pedido en ningún momento.
  const [pinDuenoSet, setPinDuenoSet] = React.useState<boolean>(false);
  const [empleadoActual, setEmpleadoActualState] = React.useState<EmpleadoActual | null>(null);
  const online = useOnlineStatus();

  const esRutaSuperAdmin = !esRutaDeNegocio(pathname ?? "");
  // El modo demo no tiene inventario/empleados reales que proteger —
  // bloquearlo solo confundiría a un prospecto probando la demo con wifi
  // inestable (ver mismo criterio en el guardia de update(), lib/session.ts).
  const rutaBloqueadaSinConexion = !online && !session?.business.demo && esRutaBloqueadaSinConexion(pathname ?? "");

  // Le pregunta al servidor si la cookie admin_impersonating (httpOnly) está
  // activa — el cliente no puede leerla directo. Solo importa mientras hay
  // sesión de negocio cargada, así que va después del gate de ready/session.
  React.useEffect(() => {
    if (!session) return;
    fetch("/api/admin/impersonate/status")
      .then((res) => res.json())
      .then((data) => setImpersonating(data.impersonating ? { adminEmail: data.adminEmail, targetEmail: data.targetEmail } : null))
      .catch(() => setImpersonating(null));
  }, [session]);

  React.useEffect(() => {
    if (!session) return;
    setEmpleadoActualState(getEmpleadoActual());
    const esNegocioReal = Boolean(session.business.ownerId);
    if (!esNegocioReal) {
      setPinDuenoSet(false);
      return;
    }
    pinDuenoConfigurado(session.business.id).then(setPinDuenoSet);
  }, [session]);

  /**
   * ÚNICO punto donde cambia quién está atendiendo — TopBar/TurnoControl
   * nunca tocan la cookie fl_empleado directo, solo llaman esto. Antes
   * "Cerrar turno"/"volver a Dueño" solo hacía setEmpleadoActualState(null)
   * (estado de React en memoria) SIN limpiar la cookie — al recargar la
   * página, getEmpleadoActual() volvía a leer la cookie vieja (todavía con
   * el vendedor puesto) y lo regresaba a modo vendedor solo: el bug real
   * detrás de "cerrar turno no funciona, al recargar vuelve a entrar como
   * vendedor". clearEmpleadoActual()/setEmpleadoActual() (lib/empleados.ts)
   * existían desde el principio pero nunca se llamaban desde ningún lado.
   */
  function handleSesionCambiada(empleado: EmpleadoActual | null) {
    if (empleado) {
      setEmpleadoActual(empleado);
    } else {
      clearEmpleadoActual();
    }
    setEmpleadoActualState(empleado);
  }

  async function handleExitImpersonation() {
    setExiting(true);
    try {
      await exitImpersonation();
      window.location.href = "/admin";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo salir de la vista de usuario.");
      setExiting(false);
    }
  }

  React.useEffect(() => {
    if (esRutaSuperAdmin) return;
    if (!ready || session) return;
    if (!isSupabaseConfigured) {
      router.replace("/login");
      return;
    }
    // Logueado pero sin negocio todavía (p. ej. abandonó /onboarding a medias)
    // debe volver a /onboarding, no a /login.
    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? "/onboarding" : "/login");
    });
  }, [ready, session, router, esRutaSuperAdmin]);

  React.useEffect(() => {
    if (!isSupabaseConfigured || !session) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      // isAdmin por email: no depende de que la policy de profiles esté
      // bien puesta para decidir si se muestra el botón (ver lib/admin-data.ts).
      setIsAdmin(data.user.email === ADMIN_EMAIL);
      supabase
        .from("profiles")
        .select("is_banned")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profile }) => setBanned(Boolean(profile?.is_banned)));
    });
  }, [session]);

  if (esRutaSuperAdmin) {
    return <>{children}</>;
  }

  if (!ready || !session) {
    return <SplashScreen />;
  }

  if (banned) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">Cuenta bloqueada</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Tu cuenta fue bloqueada por un administrador. Contáctanos si crees que es un error.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href={waLink(NUMERO_CONTACTO, "Hola, mi cuenta está bloqueada y quiero saber por qué")} target="_blank">
            Contactar 33 2909 8631
          </Link>
        </Button>
      </main>
    );
  }

  const { business } = session;

  if (!business.is_active) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">Cuenta suspendida</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Tu cuenta de {business.nombre} está pausada. Contáctanos para reactivarla.
          </p>
        </div>
        <Button asChild size="lg">
          <Link
            href={waLink(NUMERO_CONTACTO, `Hola, mi cuenta de ${business.nombre} está suspendida, quiero reactivarla`)}
            target="_blank"
          >
            Contactar 33 2909 8631
          </Link>
        </Button>
      </main>
    );
  }

  const actions = business.tipo === "barberia" ? BARBERIA_ACTIONS : business.tipo === "fonda" ? FONDA_ACTIONS : ABARROTES_ACTIONS;

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopBar
        data={session}
        isAdmin={isAdmin}
        empleadoActual={empleadoActual}
        pinDuenoSet={pinDuenoSet}
        onSesionCambiada={handleSesionCambiada}
      />
      <OfflineSalesNotice />
      <SalesSyncManager negocioId={business.id} demo={Boolean(business.demo)} />

      {impersonating && (
        <div className="sticky top-14 z-20 flex items-center justify-between gap-3 border-b border-purple-500/40 bg-purple-950/90 px-4 py-2.5 text-white">
          <p className="flex items-center gap-1.5 text-xs leading-tight">
            <UserCog className="h-4 w-4 shrink-0" />
            Viendo como <span className="font-medium">{impersonating.targetEmail}</span>
          </p>
          <Button size="sm" variant="outline" className="shrink-0 border-white/40 text-white hover:bg-white/10" onClick={handleExitImpersonation} disabled={exiting}>
            {exiting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salir de vista de usuario"}
          </Button>
        </div>
      )}

      {business.demo && (
        <div className="sticky top-14 z-20 flex items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2.5">
          <p className="text-xs leading-tight text-foreground">Estás probando una demo de abarrotera - FueraLibreta</p>
          <Button
            size="sm"
            onClick={() => {
              // Marca que viene del CTA de pago antes de mandarlo a /login —
              // /onboarding lo usa para SIEMPRE pedir teléfono y crear el
              // negocio en blanco ahí, en vez de ofrecer "activar" esta demo
              // tal cual (ver lib/demoPreview.ts).
              writePlanElegido({ plan: "pro", precio: 499 });
              router.push("/login");
            }}
          >
            Lo quiero · $499/mes
          </Button>
        </div>
      )}

      <div className="mx-auto max-w-md">
        {rutaBloqueadaSinConexion ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
              <WifiOff className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">No disponible sin conexión</h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Sin señal solo puedes seguir vendiendo. Esta pantalla vuelve a estar disponible en cuanto regrese la conexión.
              </p>
            </div>
          </div>
        ) : (
          children
        )}
      </div>

      <Fab actions={actions} onSelect={setQuickAdd} />

      {business.tipo === "barberia" && (
        <BarberiaQuickAdd active={quickAdd} onClose={() => setQuickAdd(null)} session={session} update={update} />
      )}
      {business.tipo === "fonda" && (
        <FondaQuickAdd active={quickAdd} onClose={() => setQuickAdd(null)} session={session} update={update} />
      )}
      {business.tipo === "abarrotes" && (
        <AbarrotesQuickAdd active={quickAdd} onClose={() => setQuickAdd(null)} session={session} update={update} />
      )}

      <BottomNav tipo={business.tipo} rolActual={empleadoActual?.rol} />
    </div>
  );
}
