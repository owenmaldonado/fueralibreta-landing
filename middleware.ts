import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Dominios que deben tratarse como el sitio principal (no subdominio de negocio).
const ROOT_HOSTS = ["fueralibreta.com", "www.fueralibreta.com", "localhost", "127.0.0.1"];

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0];
  const url = req.nextUrl;

  const isRootHost =
    ROOT_HOSTS.includes(hostname) || hostname.endsWith(".vercel.app") || hostname.endsWith(".vercel.dev");

  if (isRootHost) {
    return NextResponse.next();
  }

  const subdomain = hostname.endsWith(".fueralibreta.com")
    ? hostname.slice(0, -".fueralibreta.com".length)
    : hostname.split(".")[0];

  if (!subdomain || subdomain === "www") {
    return NextResponse.next();
  }

  // El subdominio identifica el negocio (slug). Se propaga por header para
  // que rutas server-side puedan resolverlo contra Supabase más adelante;
  // el MVP actual resuelve la sesión activa en el cliente vía localStorage.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-fl-subdomain", subdomain);

  if (url.pathname === "/") {
    const appUrl = url.clone();
    appUrl.pathname = "/app";
    return NextResponse.rewrite(appUrl, { request: { headers: requestHeaders } });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\..*).*)"],
};
