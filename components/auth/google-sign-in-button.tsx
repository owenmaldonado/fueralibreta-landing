"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.63H1.29A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.63l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

interface GoogleSignInButtonProps extends Omit<ButtonProps, "onClick"> {
  /**
   * Ruta final a la que llega el navegador ya con sesión (después de pasar
   * por /auth/callback). "/" por defecto: app/page.tsx decide solo entre
   * <Landing/> y <App/>, y si estás logueado pero sin negocio todavía,
   * AuthenticatedShell te manda a /onboarding.
   */
  redirectTo?: string;
}

/** Botón "Continuar con Google" que llama directo a supabase.auth.signInWithOAuth. */
export const GoogleSignInButton = React.forwardRef<HTMLButtonElement, GoogleSignInButtonProps>(
  ({ children, redirectTo = "/", disabled, ...props }, ref) => {
    const [loading, setLoading] = React.useState(false);

    async function handleClick() {
      if (loading) return;
      setLoading(true);
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl },
      });
      // No hace falta setLoading(false): signInWithOAuth ya está navegando
      // fuera de la página. Si se queda pegado (red caída, popup bloqueado),
      // el disabled de abajo sigue evitando el doble click.
    }

    return (
      <Button ref={ref} onClick={handleClick} disabled={disabled || loading || !isSupabaseConfigured} {...props}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Redirigiendo...
          </>
        ) : (
          <>
            <GoogleIcon />
            {children ?? "Continuar con Google"}
          </>
        )}
      </Button>
    );
  }
);
GoogleSignInButton.displayName = "GoogleSignInButton";
