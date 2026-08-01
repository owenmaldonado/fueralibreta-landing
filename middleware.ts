import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Dominios que deben tratarse como el sitio principal (no subdominio de negocio).
const ROOT_HOSTS = ["fueralibreta.com", "www.fueralibreta.com", "localhost", "127.0.0.1"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function middleware(req: NextRequest) {
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
  const url = req.nextUrl;

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
    appUrl.pathname = "/app";
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
