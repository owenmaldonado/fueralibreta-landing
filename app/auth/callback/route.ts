import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * A dónde Google/Supabase regresan después del login (ver GoogleSignInButton).
 *
 * Antes redirigíamos directo a /onboarding con el ?code= de PKCE en la URL,
 * y dejábamos que el cliente lo intercambiara solo (detectSessionInUrl).
 * Eso corre en el navegador después de que la página ya montó, así que
 * /onboarding a veces alcanzaba a llamar getSession() ANTES de que la
 * sesión existiera, te mandaba de vuelta a /login, y solo el segundo click
 * (cuando el intercambio ya había terminado en segundo plano) funcionaba.
 *
 * Haciendo el exchangeCodeForSession aquí, server-side, las cookies de
 * sesión quedan puestas en la respuesta de ESTA redirección — la página de
 * destino nunca se renderiza sin sesión.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/onboarding";
  const next = nextParam.startsWith("/") ? nextParam : "/onboarding";

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
