"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isSupabaseConfigured } from "@/lib/supabase";
import { contactoSchema } from "@/lib/validation";

type Status = "idle" | "loading" | "success" | "error";

const NEGOCIOS = ["Barbería", "Fonda", "Abarrotes", "Otro"] as const;

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [negocio, setNegocio] = useState<(typeof NEGOCIOS)[number]>("Barbería");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = new FormData(form);

    const parsed = contactoSchema.safeParse({
      nombre: String(data.get("nombre") ?? ""),
      telefono: String(data.get("telefono") ?? "").replace(/\D/g, ""),
      negocio,
      mensaje: String(data.get("mensaje") ?? ""),
    });

    if (!parsed.success) {
      setStatus("error");
      setErrorMsg(parsed.error.errors[0]?.message ?? "Revisa los datos del formulario.");
      return;
    }

    if (!isSupabaseConfigured) {
      // Permite ver el formulario funcionando en preview sin variables de entorno.
      await new Promise((r) => setTimeout(r, 700));
      setStatus("success");
      form.reset();
      return;
    }

    try {
      const res = await fetch("/api/public/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo enviar.");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.");
      return;
    }

    setStatus("success");
    form.reset();
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-ledger/30 bg-ledger/10 px-6 py-10 text-center">
        <CheckCircle2 className="h-9 w-9 text-ledger" />
        <p className="font-display text-lg font-semibold">¡Anotado!</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Te contactamos en menos de 24 horas para agendar tu demo. Gracias por
          confiar en nosotros.
        </p>
        <Button variant="outline" size="sm" onClick={() => setStatus("idle")}>
          Enviar otro mensaje
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" name="nombre" placeholder="Tu nombre" maxLength={50} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="telefono">WhatsApp</Label>
          <Input
            id="telefono"
            name="telefono"
            type="tel"
            placeholder="311 000 0000"
            maxLength={15}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Tipo de negocio</Label>
        <div className="flex flex-wrap gap-2 pt-1">
          {NEGOCIOS.map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setNegocio(n)}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                negocio === n
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mensaje">Cuéntanos de tu negocio</Label>
        <Textarea
          id="mensaje"
          name="mensaje"
          maxLength={1000}
          placeholder="Ej. Tengo una barbería en el centro de Tepic, somos 3 barberos y llevamos todo en libreta..."
        />
      </div>

      {status === "error" && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={status === "loading"}>
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
          </>
        ) : (
          "Quiero mi demo"
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Sin compromiso. Te llamamos por WhatsApp para agendar.
      </p>
    </form>
  );
}
