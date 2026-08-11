"use client";

import * as React from "react";
import { ArrowLeft, Loader2, Phone, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

/** Normaliza a E.164 asumiendo México (+52) si no traen código de país. */
function toE164Mx(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("52") && digits.length > 10) return `+${digits}`;
  return `+52${digits}`;
}

interface PhoneOtpFlowProps {
  /**
   * "signin": nadie tiene sesión todavía — signInWithOtp + verifyOtp(type
   * "sms") crea la cuenta si el teléfono es nuevo, o inicia sesión en la
   * cuenta existente si ya estaba registrado. Así es como Supabase resuelve
   * "1 teléfono = 1 cuenta" de forma segura, sin fusionar cuentas a mano.
   *
   * "link": ya hay una sesión (login previo con Google/Apple) y se le está
   * agregando el teléfono como identidad adicional — updateUser + verifyOtp
   * (type "phone_change"). Si ese teléfono ya pertenece a OTRA cuenta,
   * Supabase rechaza el cambio (no inicia sesión ahí ni la fusiona); se lo
   * indicamos al usuario para que use el botón de Teléfono en su lugar.
   */
  mode: "signin" | "link";
  onVerified?: (phone: string) => void;
  onCancel?: () => void;
}

export function PhoneOtpFlow({ mode, onVerified, onCancel }: PhoneOtpFlowProps) {
  const [stage, setStage] = React.useState<"phone" | "code">("phone");
  const [telefono, setTelefono] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [enviadoA, setEnviadoA] = React.useState("");

  const puedeEnviar = telefono.replace(/\D/g, "").length >= 10;
  const puedeVerificar = codigo.trim().length === 6;

  async function enviarCodigo() {
    if (!puedeEnviar || loading) return;
    setLoading(true);
    setError(null);
    const phone = toE164Mx(telefono);
    const { error: err } =
      mode === "signin" ? await supabase.auth.signInWithOtp({ phone }) : await supabase.auth.updateUser({ phone });
    setLoading(false);
    if (err) {
      // El mensaje que ve el usuario abajo es genérico a propósito (no todos
      // los fallos son culpa suya) — el real (credenciales/proveedor SMS mal
      // configurado en Supabase, número rechazado, rate limit, etc.) se
      // queda solo en consola para poder diagnosticarlo.
      console.error("No se pudo enviar el código SMS:", err);
      const msg = err.message.toLowerCase();
      setError(
        msg.includes("already") || msg.includes("registered") || msg.includes("exists")
          ? "Este teléfono ya tiene una cuenta. Cierra sesión y entra con Teléfono en vez de crear una nueva."
          : msg.includes("sms") || msg.includes("provider") || msg.includes("unable to") || msg.includes("not configured") || err.status === 500
            ? "Por ahora usa Google, SMS en mantenimiento."
            : "No se pudo enviar el código. Revisa el número e intenta de nuevo."
      );
      return;
    }
    setEnviadoA(phone);
    setStage("code");
  }

  async function verificarCodigo() {
    if (!puedeVerificar || loading) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      phone: enviadoA,
      token: codigo.trim(),
      type: mode === "signin" ? "sms" : "phone_change",
    });
    setLoading(false);
    if (err) {
      console.error("No se pudo verificar el código SMS:", err);
      setError("Código incorrecto o vencido. Intenta de nuevo.");
      return;
    }
    onVerified?.(enviadoA);
  }

  if (stage === "code") {
    return (
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            setStage("phone");
            setCodigo("");
            setError(null);
          }}
          className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Cambiar número
        </button>
        <div className="space-y-1.5">
          <Label htmlFor="otp-codigo">Código enviado a {enviadoA}</Label>
          <Input
            id="otp-codigo"
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && verificarCodigo()}
            placeholder="6 dígitos"
            className="h-14 text-center text-2xl tracking-[0.4em]"
          />
        </div>
        {error && <p className="text-left text-xs text-destructive">{error}</p>}
        <Button size="lg" className="w-full" disabled={!puedeVerificar || loading} onClick={verificarCodigo}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Verificar código
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Atrás
        </button>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="otp-telefono">Tu teléfono</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+52</span>
          <Input
            id="otp-telefono"
            autoFocus
            type="tel"
            inputMode="numeric"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviarCodigo()}
            placeholder="331 000 0000"
            className="h-14 pl-12 text-lg"
          />
        </div>
      </div>
      {error && <p className="text-left text-xs text-destructive">{error}</p>}
      <Button size="lg" className="w-full" disabled={!puedeEnviar || loading} onClick={enviarCodigo}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
        Enviar código SMS
      </Button>
    </div>
  );
}
