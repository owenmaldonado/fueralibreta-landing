import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * A dónde Google/Supabase regresan después del login (ver GoogleSignInButton
 * y el "safety net" en middleware.ts para cuando Supabase ignora el
 * redirectTo y aterriza el ?code= en otra página).
 *
 * exchangeCodeForSession server-side, ANTES de redirigir, para que la
 * sesión ya esté en cookies cuando el navegador cargue la página final —
 * nunca se le pasa el ?code= a esa página.
 *
 * Las cookies se enganchan directo al objeto de respuesta que vamos a
 * regresar (no a través de next/headers): construimos el redirect primero
 * y el adapter de Supabase escribe sobre ESE mismo response, igual que en
 * middleware.ts. Así no dependemos de que Next.js adivine a qué response
 * pertenece cada cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") ? nextParam : "/";

  if (code && supabaseUrl && supabaseAnonKey) {
    const response = NextResponse.redirect(new URL(next, origin));

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
}
