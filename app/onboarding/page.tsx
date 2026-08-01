"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Scissors, ShoppingBasket, UtensilsCrossed, PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { readSession, writeSession } from "@/lib/session";
import { createEmptyTenant, todayISO } from "@/lib/mock";
import type { BusinessType } from "@/lib/types";

const TIPOS: { value: BusinessType; label: string; icon: typeof Scissors }[] = [
  { value: "barberia", label: "Barbería", icon: Scissors },
  { value: "fonda", label: "Fonda", icon: UtensilsCrossed },
  { value: "abarrotes", label: "Abarrotes", icon: ShoppingBasket },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = React.useState(true);
  const [demoToActivate, setDemoToActivate] = React.useState<{ nombre: string; dueno: string } | null>(null);
  const [activating, setActivating] = React.useState(false);

  const [step, setStep] = React.useState(0);
  const [tipo, setTipo] = React.useState<BusinessType | null>(null);
  const [dueno, setDueno] = React.useState("");
  const [negocio, setNegocio] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    const existing = readSession();
    if (existing && !existing.business.demo) {
      router.replace("/app");
      return;
    }
    if (existing && existing.business.demo) {
      setDemoToActivate({ nombre: existing.business.nombre, dueno: existing.business.dueno });
    }
    setChecking(false);
  }, [router]);

  function activateDemo() {
    const existing = readSession();
    if (!existing) return;
    setActivating(true);
    setTimeout(() => {
      writeSession({
        ...existing,
        business: {
          ...existing.business,
          demo: false,
          is_active: true,
          trial_fin: todayISO(7),
        },
      });
      router.push("/app");
    }, 600);
  }

  function createBusinessAndGo() {
    if (!tipo) return;
    setCreating(true);
    setTimeout(() => {
      const tenant = createEmptyTenant({ dueno, nombre: negocio, telefono, tipo });
      writeSession(tenant);
      router.push("/app");
    }, 600);
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (demoToActivate) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <PartyPopper className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            ¡Listo, {demoToActivate.dueno}!
          </h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Vamos a activar <span className="text-foreground">{demoToActivate.nombre}</span> con 7
            días gratis. Tu demo se queda tal cual la armaste.
          </p>
        </div>
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
