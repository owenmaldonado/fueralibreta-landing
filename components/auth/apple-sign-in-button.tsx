"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.462 2.11-1.24 2.86-.849.82-2.15 1.44-3.22 1.35-.13-1.1.46-2.24 1.19-2.96.83-.83 2.26-1.44 3.27-1.25zM20.6 17.35c-.5 1.14-.74 1.65-1.38 2.66-.9 1.42-2.16 3.2-3.73 3.21-1.4.02-1.76-.9-3.66-.89-1.9.01-2.3.9-3.7.88-1.57-.02-2.76-1.61-3.65-3.03-2.5-3.93-2.77-8.54-1.22-11 .84-1.3 2.28-2.13 3.68-2.13 1.4 0 2.28.9 3.44.9 1.13 0 1.83-.9 3.44-.9 1.34 0 2.76.73 3.6 1.99-3.17 1.74-2.66 6.27.18 7.31z" />
    </svg>
  );
}

interface AppleSignInButtonProps extends Omit<ButtonProps, "onClick"> {
  redirectTo?: string;
}

/** Botón "Continuar con Apple", mismo patrón que GoogleSignInButton (signInWithOAuth). */
export const AppleSignInButton = React.forwardRef<HTMLButtonElement, AppleSignInButtonProps>(
  ({ children, redirectTo = "/", disabled, ...props }, ref) => {
    const [loading, setLoading] = React.useState(false);

    async function handleClick() {
      if (loading) return;
      setLoading(true);
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;
      await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: callbackUrl },
      });
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
            <AppleIcon />
            {children ?? "Continuar con Apple"}
          </>
        )}
      </Button>
    );
  }
);
AppleSignInButton.displayName = "AppleSignInButton";
