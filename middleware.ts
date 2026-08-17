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
const RUTAS_SOLO_DUENO = ["/app/empleados", "/app/configuracion"];

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

  if (RUTAS_SOLO_DUENO.some((r) => url.pathname === r || url.pathname.startsWith(`${r}/`))) {
    const cookieEmpleado = req.cookies.get("fl_empleado")?.value;
    if (cookieEmpleado) {
      try {
        const empleado = JSON.parse(cookieEmpleado);
        if (empleado?.rol && empleado.rol !== "dueno") {
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
