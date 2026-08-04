import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Dominios que deben tratarse como el sitio principal (no subdominio de negocio).
const ROOT_HOSTS = ["fueralibreta.com", "www.fueralibreta.com", "localhost", "127.0.0.1"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

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
    await supabase.auth.getUser();
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
