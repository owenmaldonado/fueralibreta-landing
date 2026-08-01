"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { fetchNegocioByOwner } from "@/lib/data";

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

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [checking, setChecking] = React.useState(true);

  const redirectAfterLogin = React.useCallback(
    async (userId: string) => {
      try {
        const business = await fetchNegocioByOwner(userId);
        router.push(business ? "/app" : "/onboarding");
      } catch (err) {
        console.error("No se pudo verificar el negocio del usuario:", err);
        router.push("/onboarding");
      }
    },
    [router]
  );

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        redirectAfterLogin(data.session.user.id);
      } else {
        setChecking(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) redirectAfterLogin(session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [redirectAfterLogin]);

  async function handleGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/onboarding` },
    });
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-background px-6 text-center">
      <div>
        <span className="font-display text-3xl font-bold tracking-tight">
          FUERA<span className="text-primary">LIBRETA</span>
        </span>
        <p className="mt-2 text-sm text-muted-foreground">Entra para administrar tu negocio</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button
          size="lg"
          variant="outline"
          className="w-full gap-3 bg-card"
          onClick={handleGoogle}
          disabled={loading || !isSupabaseConfigured}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
          Continuar con Google
        </Button>

        {!isSupabaseConfigured && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Falta configurar Supabase (variables NEXT_PUBLIC_SUPABASE_URL /
            NEXT_PUBLIC_SUPABASE_ANON_KEY) para iniciar sesión con Google.
          </div>
        )}
      </div>
    </main>
  );
}
