import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Dominios que deben tratarse como el sitio principal (no subdominio de negocio).
const ROOT_HOSTS = ["fueralibreta.com", "www.fueralibreta.com", "localhost", "127.0.0.1"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Multiusuario (modo PIN, ver lib/empleados.ts): rutas exclusivas del dueño.
// Un empleado con la cookie fl_empleado puesta (rol != "dueno") que intenta
// entrar aquí por URL directa se bloquea y regresa a Hoy — esto corre en el
// edge (antes de renderizar la página), por eso fl_empleado es una cookie
// normal y no localStorage: localStorage no existe aquí.
// Gastos y Caja son la sección de REPORTES: totales acumulados, ganancia
// histórica y las gráficas. PERMISOS (lib/empleados.ts) ya decía que ni
// encargado ni vendedor pueden ver eso (verGananciasHistoricas /
// verGraficasCompletas en false para ambos), pero nada lo comprobaba: esas
// rutas no estaban en ninguna lista, así que un vendedor con PIN entraba a
// /app/gastos y veía cuánto gana el negocio. El permiso existía en la tabla
// y no en la puerta.
//
// Registrar un gasto o una venta NO se pierde: eso vive en el botón + del
// FAB, que sigue disponible para todos los roles. Lo que se cierra es el
// reporte, no la captura.
// /app/cortes (reporte de cierres) va aquí por lo obvio: es la pantalla
// donde el dueño revisa si el efectivo que entregó su vendedor cuadró.
const RUTAS_SOLO_DUENO = ["/app/empleados", "/app/configuracion", "/app/gastos", "/app/caja", "/app/cortes"];

// Igual que RUTAS_SOLO_DUENO pero solo bloquea "vendedor" — un "encargado"
// SÍ puede ajustar inventario (PERMISOS.encargado.ajustarInventario=true en
// lib/empleados.ts), a diferencia de Configuración/Empleados donde ambos
// roles están igual de restringidos. Un vendedor podía entrar a Productos
// por URL directa y cambiar precios/costos aunque el botón estuviera
// oculto en /app/mas.
// Vacío a propósito. Antes /app/productos estaba aquí, con la idea de que
// un vendedor no tocara precios ni stock. Se abre a los tres roles porque
// pasa seguido que le dejen la tienda sola al vendedor: si no puede
// corregir existencias cuando entra mercancía, el inventario se
// desincroniza y deja de servirle a nadie. Ajustar stock no revela cuánto
// gana el negocio — eso es lo que cuidan RUTAS_SOLO_DUENO de arriba. Ver
// PERMISOS.vendedor.ajustarInventario en lib/empleados.ts.
//
// Se deja la lista (y el mecanismo) en pie, no borrada, porque es donde va
// a caer la siguiente ruta que necesite "todos menos vendedor".
const RUTAS_SOLO_DUENO_O_ENCARGADO: string[] = [];

// Mismo set que SEGMENTOS_DE_NEGOCIO en
// components/app-shell/authenticated-shell.tsx — duplicado a propósito: ese
// vive en un Client Component, este corre en el edge. Mantenerlos en sync si
// se agrega una pantalla nueva de negocio (todo lo que NO está aquí es del
// hub de super-admin, que nunca debe bloquearse por el trial de un negocio).
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
  "mi-plan",
  "pedidos",
  "productos",
]);

function esRutaDeNegocio(pathname: string): boolean {
  if (pathname === "/app") return true;
  const segmento = pathname.split("/")[2];
  return SEGMENTOS_DE_NEGOCIO.has(segmento ?? "");
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // Red de seguridad: el OAuth de Google/Supabase debería volver por
  // /auth/callback (que hace el exchangeCodeForSession server-side), pero
  // si el dominio no está en la lista de Redirect URLs permitidas en el
  // dashboard de Supabase (Authentication -> URL Configuration), Supabase
  // ignora el redirectTo que le mandamos y aterriza el ?code= directo en
  // cualquier página — dejando que el navegador lo intercambie solo y
  // corriendo la carrera que causaba el doble login. Si eso pasa, lo
  // interceptamos aquí antes de que la página cliente vea el ?code=.
  const strayCode = url.searchParams.get("code");
  if (strayCode && url.pathname !== "/auth/callback") {
    const target = new URL("/auth/callback", url.origin);
    target.searchParams.set("code", strayCode);
    target.searchParams.set("next", url.pathname);
    return NextResponse.redirect(target);
  }

  const coincideRuta = (rutas: string[]) => rutas.some((r) => url.pathname === r || url.pathname.startsWith(`${r}/`));
  const esRutaSoloDueno = coincideRuta(RUTAS_SOLO_DUENO);
  const esRutaSoloDuenoOEncargado = !esRutaSoloDueno && coincideRuta(RUTAS_SOLO_DUENO_O_ENCARGADO);

  if (esRutaSoloDueno || esRutaSoloDuenoOEncargado) {
    const cookieEmpleado = req.cookies.get("fl_empleado")?.value;
    if (cookieEmpleado) {
      try {
        const empleado = JSON.parse(cookieEmpleado);
        const bloqueado = esRutaSoloDueno ? empleado?.rol && empleado.rol !== "dueno" : empleado?.rol === "vendedor";
        if (bloqueado) {
          // ?bloqueado=dueno&destino=<ruta pedida>: antes este redirect era
          // mudo — un empleado (o una cookie fl_empleado vieja/colgada en
          // OTRA pestaña de este mismo navegador, que el dueño de esta
          // pestaña ni sabe que existe — las cookies son por navegador, no
          // por pestaña, así que la sesión "Dueño" que se ve aquí puede no
          // coincidir con lo que el middleware lee) que picaba
          // Configuración simplemente "rebotaba a Hoy" sin explicación,
          // indistinguible de un bug. AuthenticatedShell lee estos query
          // params y muestra un toast con botón "Cambiar a modo Dueño" que
          // limpia la cookie y regresa derecho a `destino`, en vez de un
          // bounce mudo que dejaba al dueño real varado en Hoy.
          const destino = new URL("/app/inicio", url.origin);
          destino.searchParams.set("bloqueado", "dueno");
          destino.searchParams.set("destino", url.pathname);
          return NextResponse.redirect(destino);
        }
      } catch {
        // Cookie corrupta/vieja: no bloquea, se comporta como si no hubiera empleado activo.
      }
    }
  }

  // /app/fuera-libreta es el destino de "Entrar" para la tarjeta de Fuera
  // Libreta en /app/admin-hub. Se resuelve aquí (edge, siempre 307 real) en
  // vez de con redirect() dentro de un Server Component anidado bajo
  // app/app/layout.tsx: ahí Next.js a veces manda el redirect codificado
  // dentro del payload RSC (200 OK + digest NEXT_REDIRECT) en lugar de un
  // 3xx real por HTTP, porque el layout padre (AuthenticatedShell) es un
  // Client Component y ya se había empezado a mandar la respuesta.
  if (url.pathname === "/app/fuera-libreta") {
    return NextResponse.redirect(new URL("/app/admin-dashboard", url.origin));
  }

  // Refresca la sesión de Supabase (guardada en cookies) en cada request.
  // Sin esto, los Server Components verían tokens vencidos con getUser().
  let response = NextResponse.next({ request: req });

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Bloquea el acceso a /app y /admin de raíz para cualquier cuenta
    // baneada (profiles.is_banned) — antes esto solo se checaba client-side
    // dentro de AuthenticatedShell, así que una cuenta baneada podía seguir
    // pegándole a /admin (si de casualidad seguía siendo admin) o ver un
    // parpadeo de contenido real antes de que el chequeo del cliente
    // reaccionara. profiles_self_select ya deja a cualquier usuario leer su
    // propia fila, así que no hace falta service_role aquí.
    const enRutaProtegida = url.pathname === "/app" || url.pathname.startsWith("/app/") || url.pathname === "/admin";
    if (user && enRutaProtegida && url.pathname !== "/cuenta-suspendida") {
      const { data: profile } = await supabase.from("profiles").select("is_banned").eq("id", user.id).maybeSingle();
      if (profile?.is_banned) {
        return NextResponse.redirect(new URL("/cuenta-suspendida", url.origin));
      }
    }

    // Bloqueo por trial/plan vencido: no hay una columna separada para
    // "cuándo vence el plan de pago" (plan_expires_at) — trial_fin se trata
    // como "acceso bueno hasta" en general (ver bloqueadoPorTrial en
    // lib/planes.ts), así que activar un plan de pago desde /admin también
    // reempuja esta misma fecha ("Activar 30 días"). Solo aplica a
    // pantallas de negocio (esRutaDeNegocio) — nunca al hub de super-admin
    // ni a /admin mismo, para que el propio admin no se bloquee a sí mismo
    // por el trial de un negocio de prueba que tenga a su nombre.
    //
    // PR #122: bloquea SIEMPRE que no haya pagado nunca (ultimo_pago_at
    // null), apenas vence trial_fin — el trial básico de todo registro
    // nuevo y un trial PRO de cortesía activado desde /admin se tratan
    // igual, sin días de gracia ("si el trial baja a básico feo gratis
    // para siempre, nadie paga"). Quien SÍ pagó alguna vez (ultimo_pago_at
    // no null) sí tiene DIAS_GRACIA_PAGO días extra después de vencer
    // (Básico feo, sin bloquear) antes de bloquearse — mismo criterio que
    // bloqueadoPorTrial/DIAS_GRACIA_PAGO en lib/planes.ts, reimplementado
    // aquí en vez de importarlo porque el middleware corre en el Edge
    // runtime con su propio bundle, ya independiente de lib/planes.ts.
    if (user && esRutaDeNegocio(url.pathname)) {
      const { data: negocio } = await supabase
        .from("negocios")
        .select("trial_fin,is_active,es_fundador,ultimo_pago_at")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (negocio && negocio.is_active && !negocio.es_fundador) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const trialFin = new Date(`${negocio.trial_fin}T00:00:00`);
        const diasGracia = negocio.ultimo_pago_at ? 3 : 0;
        const limite = trialFin.getTime() + diasGracia * 86_400_000;
        if (limite < hoy.getTime()) {
          return NextResponse.redirect(new URL("/planes-bloqueado", url.origin));
        }
      }
    }
  }

  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0];

  const isRootHost =
    ROOT_HOSTS.includes(hostname) || hostname.endsWith(".vercel.app") || hostname.endsWith(".vercel.dev");

  if (isRootHost) {
    return response;
  }

  const subdomain = hostname.endsWith(".fueralibreta.com")
    ? hostname.slice(0, -".fueralibreta.com".length)
    : hostname.split(".")[0];

  if (!subdomain || subdomain === "www") {
    return response;
  }

  // El subdominio identifica el negocio (slug). Se propaga por header para
  // que rutas server-side puedan resolverlo contra Supabase más adelante;
  // el MVP actual resuelve la sesión activa en el cliente vía Supabase.
  if (url.pathname === "/") {
    const appUrl = url.clone();
    appUrl.pathname = "/app/inicio";
    const rewritten = NextResponse.rewrite(appUrl, { request: req });
    rewritten.headers.set("x-fl-subdomain", subdomain);
    // Conserva las cookies de sesión refrescadas arriba en la respuesta final.
    response.cookies.getAll().forEach((c) => rewritten.cookies.set(c.name, c.value));
    return rewritten;
  }

  response.headers.set("x-fl-subdomain", subdomain);
  return response;
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\..*).*)"],
};
