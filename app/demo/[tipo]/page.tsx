"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Scissors, UtensilsCrossed, ShoppingBasket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { writeSession } from "@/lib/session";
import {
  generateDemoAbarrotes,
  generateDemoBarberia,
  generateDemoFonda,
} from "@/lib/mock";
import type { BusinessType } from "@/lib/types";

const TIPO_INFO: Record<BusinessType, { titulo: string; icon: typeof Scissors; color: string }> = {
  barberia: { titulo: "Barbería", icon: Scissors, color: "text-primary" },
  fonda: { titulo: "Fonda", icon: UtensilsCrossed, color: "text-primary" },
  abarrotes: { titulo: "Abarrotes", icon: ShoppingBasket, color: "text-primary" },
};

interface FormState {
  dueno: string;
  negocio: string;
  telefono: string;
  extra1: string;
  extra2: string;
}

const EXTRA_LABELS: Record<BusinessType, { label1: string; help1: string; label2: string; help2: string }> = {
  barberia: {
    label1: "Nombre de un cliente nuevo",
    help1: "Le crearemos una cita hoy a las 3:00pm para que veas la notificación.",
    label2: "Nombre de un cliente frecuente",
    help2: "Simularemos que no viene desde hace 28 días, para ver la alerta.",
  },
  fonda: {
    label1: "Platillo de hoy #1",
    help1: "Ej. Pozole",
    label2: "Platillo de hoy #2",
    help2: "Ej. Mole con pollo",
  },
  abarrotes: {
    label1: "Producto #1 de tu inventario",
    help1: "Ej. Coca-Cola 600ml",
    label2: "Producto #2 de tu inventario",
    help2: "Ej. Leche 1L",
  },
};

export default function DemoIntakePage() {
  const params = useParams<{ tipo: string }>();
  const router = useRouter();
  const tipo = params.tipo as BusinessType;

  const [step, setStep] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState<FormState>({
    dueno: "",
    negocio: "",
    telefono: "",
    extra1: "",
    extra2: "",
  });

  if (!TIPO_INFO[tipo]) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
        <p className="text-muted-foreground">Elige el tipo de negocio para tu demo:</p>
        <div className="flex flex-wrap justify-center gap-3">
          {(Object.keys(TIPO_INFO) as BusinessType[]).map((t) => (
            <Button key={t} asChild variant="outline">
              <Link href={`/demo/${t}`}>{TIPO_INFO[t].titulo}</Link>
            </Button>
          ))}
        </div>
      </main>
    );
  }

  const info = TIPO_INFO[tipo];
  const Icon = info.icon;
  const extraLabels = EXTRA_LABELS[tipo];

  const steps = [
    { key: "dueno", label: "¿Cómo te llamas?", placeholder: "Tu nombre" },
    { key: "negocio", label: "¿Cómo se llama tu negocio?", placeholder: `Ej. ${info.titulo} El Buen Corte` },
    { key: "telefono", label: "¿Cuál es tu WhatsApp?", placeholder: "331 000 0000", type: "tel" },
    { key: "extra1", label: extraLabels.label1, placeholder: extraLabels.help1 },
    { key: "extra2", label: extraLabels.label2, placeholder: extraLabels.help2 },
  ] as const;

  const total = steps.length;
  const current = steps[step];
  const value = form[current.key];
  const canContinue = value.trim().length > 1;

  function update(key: keyof FormState, v: string) {
    setForm((f) => ({ ...f, [key]: v }));
  }

  function next() {
    if (!canContinue) return;
    if (step < total - 1) {
      setStep((s) => s + 1);
    } else {
      generate();
    }
  }

  function back() {
    if (step === 0) {
      router.push("/");
    } else {
      setStep((s) => s - 1);
    }
  }

  function generate() {
    setLoading(true);
    setTimeout(() => {
      const base = { dueno: form.dueno, negocio: form.negocio, telefono: form.telefono };
      const tenant =
        tipo === "barberia"
          ? generateDemoBarberia({ ...base, cliente1: form.extra1, cliente2: form.extra2 })
          : tipo === "fonda"
            ? generateDemoFonda({ ...base, platillo1: form.extra1, platillo2: form.extra2 })
            : generateDemoAbarrotes({ ...base, producto1: form.extra1, producto2: form.extra2 });
      writeSession(tenant);
      router.push("/app");
    }, 900);
  }

  return (
    <main className="flex min-h-screen flex-col bg-background px-6 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <button
          onClick={back}
          className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Atrás
        </button>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Icon className={`h-5 w-5 ${info.color}`} />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Demo {info.titulo}
            </p>
            <p className="text-xs text-muted-foreground">Paso {step + 1} de {total} · menos de 1 minuto</p>
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-display text-lg font-semibold">Armando tu demo…</p>
            <p className="text-sm text-muted-foreground">
              Generando {form.negocio || "tu negocio"} con tus datos.
            </p>
          </div>
        ) : (
          <div className="mt-10 flex flex-1 flex-col">
            <Label htmlFor={current.key} className="text-base normal-case tracking-normal text-foreground">
              {current.label}
            </Label>
            <Input
              id={current.key}
              autoFocus
              type={"type" in current ? current.type : "text"}
              value={value}
              onChange={(e) => update(current.key, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder={current.placeholder}
              className="mt-3 h-14 text-lg"
            />

            <div className="mt-auto pt-10">
              <Button size="lg" className="w-full" disabled={!canContinue} onClick={next}>
                {step < total - 1 ? "Continuar" : "Generar mi demo"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
