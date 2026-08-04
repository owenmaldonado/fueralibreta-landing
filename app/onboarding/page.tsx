"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2, Scissors, ShoppingBasket, UtensilsCrossed, PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { PhoneOtpFlow } from "@/components/auth/phone-otp-flow";
import { useSession } from "@/lib/session";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { fetchNegocioByOwner } from "@/lib/data";
import { readDemoPreview } from "@/lib/demoPreview";
import { createEmptyTenant } from "@/lib/mock";
import type { BusinessType, TenantData } from "@/lib/types";

const TIPOS: { value: BusinessType; label: string; icon: typeof Scissors }[] = [
  { value: "barberia", label: "Barbería", icon: Scissors },
  { value: "fonda", label: "Fonda", icon: UtensilsCrossed },
  { value: "abarrotes", label: "Abarrotes", icon: ShoppingBasket },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { claim } = useSession();

  const [checking, setChecking] = React.useState(true);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [needsPhone, setNeedsPhone] = React.useState(false);
  const [demoTenant, setDemoTenant] = React.useState<TenantData | null>(null);
  const [activating, setActivating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [step, setStep] = React.useState(0);
  const [tipo, setTipo] = React.useState<BusinessType | null>(null);
  const [dueno, setDueno] = React.useState("");
  const [negocio, setNegocio] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    async function check() {
      if (!isSupabaseConfigured) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);

      try {
        const business = await fetchNegocioByOwner(user.id);
        if (business) {
          router.replace("/app/inicio");
          return;
        }
      } catch (err) {
        console.error("No se pudo verificar si ya tienes un negocio:", err);
      }

      // Quien entró por Teléfono ya trae user.phone verificado. Quien entró
      // por Google/Apple todavía no — hay que verificarlo antes de dejarlo
      // crear un negocio, para que "1 teléfono = 1 cuenta" también aplique
      // a las cuentas que empiezan por redes sociales.
      if (!user.phone) {
        setNeedsPhone(true);
        setChecking(false);
        return;
      }

      setTelefono(user.phone);
      const demo = readDemoPreview();
      if (demo) setDemoTenant(demo);
      setChecking(false);
    }
    check();
  }, [router]);

  function onPhoneVerified(phone: string) {
    setTelefono(phone.replace(/^\+52/, ""));
    setNeedsPhone(false);
    const demo = readDemoPreview();
    if (demo) setDemoTenant(demo);
  }

  async function activateDemo() {
    if (!demoTenant || !userId) return;
    setActivating(true);
    setError(null);
    try {
      await claim(demoTenant, userId);
      router.push("/app/inicio");
    } catch (err) {
      console.error("No se pudo activar la demo:", err);
      setError("No se pudo activar tu demo. Intenta de nuevo.");
      setActivating(false);
    }
  }

  async function createBusinessAndGo() {
    if (!tipo || !userId) return;
    setCreating(true);
    setError(null);
    try {
      const tenant = createEmptyTenant({ dueno, nombre: negocio, telefono, tipo });
      await claim(tenant, userId);
      router.push("/app/inicio");
    } catch (err) {
      console.error("No se pudo crear el negocio:", err);
      setError("No se pudo crear tu sistema. Intenta de nuevo.");
      setCreating(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (needsPhone) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Verifica tu teléfono</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Antes de crear tu negocio necesitamos confirmar tu número por SMS. Así cada teléfono es una sola cuenta.
          </p>
        </div>
        <PhoneOtpFlow mode="link" onVerified={onPhoneVerified} />
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/login");
          }}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          ¿Ese teléfono ya es tuyo? Cierra sesión y entra con Teléfono
        </button>
      </main>
    );
  }

  if (demoTenant) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <PartyPopper className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">¡Listo, {demoTenant.business.dueno}!</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Vamos a activar <span className="text-foreground">{demoTenant.business.nombre}</span> con 7 días
            gratis. Tu demo se queda tal cual la armaste.
          </p>
        </div>
        {error && (
          <div className="flex max-w-xs items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <Button size="lg" className="w-full max-w-xs" onClick={activateDemo} disabled={activating}>
          {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activar mi sistema — 7 días gratis"}
        </Button>
      </main>
    );
  }

  const steps = ["tipo", "dueno", "negocio", "telefono"] as const;
  const current = steps[step];
  const canContinue =
    current === "tipo" ? !!tipo : current === "dueno" ? dueno.trim().length > 1 : current === "negocio" ? negocio.trim().length > 1 : telefono.trim().length > 6;

  function next() {
    if (!canContinue) return;
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
    } else {
      createBusinessAndGo();
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background px-6 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Crea tu negocio · paso {step + 1} de {steps.length}
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        {creating ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-display text-lg font-semibold">Creando tu sistema…</p>
          </div>
        ) : (
          <div className="mt-10 flex flex-1 flex-col">
            {current === "tipo" && (
              <>
                <Label className="text-base normal-case tracking-normal text-foreground">
                  ¿Qué tipo de negocio tienes?
                </Label>
                <ChipGroup className="mt-4">
                  {TIPOS.map((t) => (
                    <Chip key={t.value} selected={tipo === t.value} onClick={() => setTipo(t.value)}>
                      <span className="flex items-center gap-1.5">
                        <t.icon className="h-4 w-4" /> {t.label}
                      </span>
                    </Chip>
                  ))}
                </ChipGroup>
              </>
            )}

            {current === "dueno" && (
              <>
                <Label htmlFor="dueno" className="text-base normal-case tracking-normal text-foreground">
                  ¿Cómo te llamas?
                </Label>
                <Input
                  id="dueno"
                  autoFocus
                  value={dueno}
                  onChange={(e) => setDueno(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  placeholder="Tu nombre"
                  className="mt-3 h-14 text-lg"
                />
              </>
            )}

            {current === "negocio" && (
              <>
                <Label htmlFor="negocio" className="text-base normal-case tracking-normal text-foreground">
                  ¿Cómo se llama tu negocio?
                </Label>
                <Input
                  id="negocio"
                  autoFocus
                  value={negocio}
                  onChange={(e) => setNegocio(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  placeholder="Nombre de tu negocio"
                  className="mt-3 h-14 text-lg"
                />
              </>
            )}

            {current === "telefono" && (
              <>
                <Label htmlFor="telefono" className="text-base normal-case tracking-normal text-foreground">
                  ¿Cuál es tu WhatsApp?
                </Label>
                <Input
                  id="telefono"
                  autoFocus
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  placeholder="331 000 0000"
                  className="mt-3 h-14 text-lg"
                />
              </>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="mt-auto pt-10">
              <Button size="lg" className="w-full" disabled={!canContinue} onClick={next}>
                {step < steps.length - 1 ? "Continuar" : "Crear mi sistema"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
