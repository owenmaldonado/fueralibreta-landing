"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Phone } from "lucide-react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { PhoneOtpFlow } from "@/components/auth/phone-otp-flow";
import { Button } from "@/components/ui/button";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { fetchNegocioByOwner } from "@/lib/data";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = React.useState(true);
  const [showPhone, setShowPhone] = React.useState(false);

  const redirectAfterLogin = React.useCallback(
    async (userId: string) => {
      try {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
        if (profile?.role === "admin") {
          router.push("/app/admin-hub");
          return;
        }
        const business = await fetchNegocioByOwner(userId);
        router.push(business ? "/app/inicio" : "/onboarding");
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

      {showPhone ? (
        <PhoneOtpFlow mode="signin" onCancel={() => setShowPhone(false)} />
      ) : (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button size="lg" className="w-full gap-3" onClick={() => setShowPhone(true)} disabled={!isSupabaseConfigured}>
            <Phone className="h-4 w-4" />
            Entrar con Teléfono
          </Button>
          <GoogleSignInButton size="lg" variant="outline" className="w-full gap-3 bg-card" />

          {!isSupabaseConfigured && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Falta configurar Supabase (variables NEXT_PUBLIC_SUPABASE_URL /
              NEXT_PUBLIC_SUPABASE_ANON_KEY) para iniciar sesión.
            </div>
          )}
        </div>
      )}
    </main>
  );
}
