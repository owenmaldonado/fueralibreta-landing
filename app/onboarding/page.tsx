"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Check, Loader2, Scissors, ShoppingBasket, UtensilsCrossed, PartyPopper, X } from "lucide-react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/lib/session";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { fetchNegocioByOwner } from "@/lib/data";
import { updateUserPlan } from "@/lib/admin-data";
import { readDemoPreview, readPlanElegido, clearDemoPreview, clearPlanElegido } from "@/lib/demoPreview";
import { createEmptyTenant, tenantFromDemo, formatMoney } from "@/lib/mock";
import { PRECIOS_POR_GIRO } from "@/lib/planes";
import type { BusinessType, TenantData } from "@/lib/types";

const TIPOS: { value: BusinessType; label: string; icon: typeof Scissors }[] = [
  { value: "barberia", label: "Barbería", icon: Scissors },
  { value: "fonda", label: "Fonda", icon: UtensilsCrossed },
  { value: "abarrotes", label: "Abarrotes", icon: ShoppingBasket },
];

/**
 * fl_demo_preview puede venir corrupto o de una versión vieja del esquema
 * (localStorage no tiene validación de tipos) — sin esto, un dato mal
 * formado tronaba el efecto entero y dejaba /onboarding pegado en el
 * spinner. Si no pasa el chequeo, se trata como si no hubiera demo (el
 * wizard completo de abajo sigue funcionando con negocio vacío) y se
 * limpia la clave corrupta para no repetir el problema en el próximo intento.
 */
function esDemoValida(x: unknown): x is TenantData {
  if (!x || typeof x !== "object") return false;
  const business = (x as { business?: unknown }).business as
    | { tipo?: unknown; dueno?: unknown; nombre?: unknown }
    | undefined;
  return (
    !!business &&
    typeof business.tipo === "string" &&
    typeof business.dueno === "string" &&
    typeof business.nombre === "string"
  );
}

/** Nombre para mostrar de la sesión de Google — evita volver a preguntar "¿cómo te llamas?" cuando ya lo sabemos. */
function duenoDeGoogle(user: { user_metadata?: Record<string, unknown>; email?: string | null }): string {
  const meta = user.user_metadata ?? {};
  const nombre = (meta.full_name as string) || (meta.name as string) || "";
  if (nombre.trim()) return nombre.trim();
  if (user.email) return user.email.split("@")[0];
  return "Dueño";
}

/** Arma el mensaje que se muestra EN PANTALLA (no solo en consola) con el error real de Supabase, no un genérico. */
function mensajeErrorReal(err: unknown): string {
  const e = err as { message?: string } | null;
  return e?.message ? `No se pudo crear tu sistema: ${e.message}` : "No se pudo crear tu sistema. Intenta de nuevo.";
}

/** Loguea el error de Supabase completo (no solo el mensaje) para poder diagnosticarlo desde la consola/Vercel logs. */
function logCreateError(context: string, err: unknown) {
  const e = err as { message?: string; code?: string; details?: string; hint?: string } | null;
  console.error(context, {
    message: e?.message,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
    raw: err,
  });
}

function TerminosCheckbox({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <label className="mt-4 flex items-start gap-2.5 text-left text-xs text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
      <span>
        Acepto{" "}
        <Link href="/terminos" target="_blank" className="font-medium text-foreground underline underline-offset-2">
          Términos y Condiciones
        </Link>{" "}
        y{" "}
        <Link href="/aviso-privacidad" target="_blank" className="font-medium text-foreground underline underline-offset-2">
          Aviso de Privacidad
        </Link>{" "}
        <span className="text-muted-foreground/70">[ver]</span>
      </span>
    </label>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { claim } = useSession();

  const [checking, setChecking] = React.useState(true);
  // true si fetchNegocioByOwner falló y no sabemos si ya tiene negocio — en
  // ese caso NUNCA se muestra el formulario de alta (podría duplicar), se
  // ofrece reintentar la verificación.
  const [checkFailed, setCheckFailed] = React.useState(false);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [dueno, setDueno] = React.useState("");
  const [demoTenant, setDemoTenant] = React.useState<TenantData | null>(null);
  // Viene del botón "Lo quiero" del banner de demo (o simplemente de haber
  // llegado hasta aquí, que ya implica intención de alta): en cuanto el
  // negocio quede creado se sube profiles.plan a "pro" para que aparezca
  // correctamente en /admin.
  const [planElegido, setPlanElegido] = React.useState(false);
  const [nombre, setNombre] = React.useState("");
  const [tipo, setTipo] = React.useState<BusinessType | null>(null);
  const [aceptaTerminos, setAceptaTerminos] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Guardia sincrónica contra doble submit (doble tap, Enter + click casi
  // juntos): `creating` es estado de React y puede tardar un render en
  // reflejarse en el botón, suficiente para que un segundo click dispare
  // otra creación con el mismo fl_demo_preview antes de que el primero
  // termine. Con ids frescos (ver tenantFromDemo en lib/mock.ts) eso ya no
  // truena, pero igual crearía dos negocios de más — este ref corta el
  // segundo intento antes de que llegue a Supabase.
  const creandoRef = React.useRef(false);

  const runCheck = React.useCallback(async () => {
    setChecking(true);
    setCheckFailed(false);

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
    setDueno(duenoDeGoogle(user));

    try {
      const business = await fetchNegocioByOwner(user.id);
      if (business) {
        router.replace("/app/inicio");
        return;
      }
    } catch (err) {
      // No se pudo verificar si ya tiene negocio: NUNCA se muestra el
      // formulario de alta en este caso (crearía un negocio duplicado si
      // resulta que sí tenía uno) — se ofrece reintentar en su lugar.
      console.error("No se pudo verificar si ya tienes un negocio:", err);
      setCheckFailed(true);
      setChecking(false);
      return;
    }

    // El teléfono ya no es requisito para crear el negocio (SMS OTP no
    // está configurado y estaba bloqueando el alta) — se crea sin él y se
    // puede agregar después en Configuración > Perfil.
    const demo = readDemoPreview();
    if (demo && esDemoValida(demo)) {
      setDemoTenant(demo);
      setNombre(demo.business.nombre);
    } else if (demo) {
      console.error("fl_demo_preview tenía un formato inválido, se ignora:", demo);
      clearDemoPreview();
    }
    setPlanElegido(readPlanElegido() !== null);
    setChecking(false);
  }, [router]);

  React.useEffect(() => {
    runCheck();
  }, [runCheck]);

  // El plan pro se marca siempre que se completa este flujo de alta — es la
  // única forma de crear un negocio en la app hoy, así que llegar hasta el
  // final ya es la señal de "quiero el plan pagado". Esto es profiles.plan
  // ("free"/"pro", flag simple de /admin), no negocios.plan — no tiene
  // relación con el precio por giro que se muestra en los botones de abajo.
  async function marcarPlanPro(uid: string) {
    try {
      await updateUserPlan(uid, "pro");
    } catch (err) {
      // No bloquea el alta: el negocio ya quedó creado, esto solo afecta lo
      // que se ve en /admin y se puede corregir a mano ahí si llega a fallar.
      console.error("No se pudo marcar el plan pro del usuario:", err);
    }
  }

  // Único paso cuando SÍ hay demo previa (/demo/[tipo] -> "Lo quiero"): ya
  // sabemos tipo y dueño, solo se confirma/edita el nombre del negocio. El
  // catálogo (platillos/servicios/productos) que vio en la demo se copia tal
  // cual — "en blanco" es de actividad (sin citas/pedidos/ventas de ejemplo),
  // no de catálogo.
  async function crearDesdeDemo() {
    if (!demoTenant || !userId || nombre.trim().length < 2 || !aceptaTerminos || creandoRef.current) return;
    creandoRef.current = true;
    setCreating(true);
    setError(null);
    try {
      const tenant = tenantFromDemo(demoTenant, { nombre: nombre.trim(), telefono: "" });
      tenant.business.acceptedTermsAt = new Date().toISOString();
      await claim(tenant, userId);
      await marcarPlanPro(userId);
      clearPlanElegido();
      router.push("/app/inicio");
    } catch (err) {
      logCreateError("No se pudo crear el negocio desde la demo:", err);
      setError(mensajeErrorReal(err));
      setCreating(false);
      creandoRef.current = false;
    }
  }

  // Arranque en frío (sin haber pasado por /demo/[tipo]): único caso donde
  // hace falta preguntar el tipo de negocio, porque no hay otra fuente. El
  // dueño ya se sacó del perfil de Google — no se vuelve a preguntar.
  async function createBusinessAndGo() {
    if (!tipo || !userId || nombre.trim().length < 2 || !aceptaTerminos || creandoRef.current) return;
    creandoRef.current = true;
    setCreating(true);
    setError(null);
    try {
      const tenant = createEmptyTenant({ dueno, nombre: nombre.trim(), telefono: "", tipo });
      tenant.business.acceptedTermsAt = new Date().toISOString();
      await claim(tenant, userId);
      await marcarPlanPro(userId);
      clearPlanElegido();
      router.push("/app/inicio");
    } catch (err) {
      logCreateError("No se pudo crear el negocio:", err);
      setError(mensajeErrorReal(err));
      setCreating(false);
      creandoRef.current = false;
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (checkFailed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">No pudimos verificar tu cuenta</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Puede ser un problema de conexión momentáneo. Revisa la consola para el error exacto.
          </p>
        </div>
        <Button size="lg" onClick={runCheck}>
          Reintentar
        </Button>
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
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">7 días gratis. Así arranca tu negocio nuevo:</p>
          <ul className="mt-3 w-full max-w-xs space-y-1.5 text-left text-sm">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ledger" />
              <span>
                Tus productos/servicios y precios de la demo, copiados — <span className="font-medium text-foreground">privados y tuyos</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>Las citas/ventas de ejemplo NO se copian — arrancas en blanco</span>
            </li>
          </ul>
        </div>

        {creating ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-display text-lg font-semibold">Creando tu sistema…</p>
          </div>
        ) : (
          <div className="w-full max-w-xs text-left">
            <Label htmlFor="nombre-demo" className="text-base normal-case tracking-normal text-foreground">
              Nombre de tu negocio
            </Label>
            <Input
              id="nombre-demo"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && crearDesdeDemo()}
              placeholder="Nombre de tu negocio"
              className="mt-3 h-14 text-lg"
            />

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <TerminosCheckbox checked={aceptaTerminos} onCheckedChange={setAceptaTerminos} />

            <Button
              size="lg"
              className="mt-4 w-full"
              onClick={crearDesdeDemo}
              disabled={nombre.trim().length < 2 || !aceptaTerminos}
            >
              Iniciar mi prueba de 7 días — {formatMoney(PRECIOS_POR_GIRO[demoTenant.business.tipo].basico)}/mes
            </Button>
          </div>
        )}
      </main>
    );
  }

  // Arranque en frío: solo tipo de negocio (no hay otra fuente) + nombre.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">¡Hola, {dueno}!</h1>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">Crea tu negocio y arranca tu prueba de 7 días.</p>
      </div>

      {creating ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-display text-lg font-semibold">Creando tu sistema…</p>
        </div>
      ) : (
        <div className="w-full max-w-xs text-left">
          <Label className="text-base normal-case tracking-normal text-foreground">¿Qué tipo de negocio tienes?</Label>
          <ChipGroup className="mt-3">
            {TIPOS.map((t) => (
              <Chip key={t.value} selected={tipo === t.value} onClick={() => setTipo(t.value)}>
                <span className="flex items-center gap-1.5">
                  <t.icon className="h-4 w-4" /> {t.label}
                </span>
              </Chip>
            ))}
          </ChipGroup>

          <Label htmlFor="negocio" className="mt-6 block text-base normal-case tracking-normal text-foreground">
            ¿Cómo se llama tu negocio?
          </Label>
          <Input
            id="negocio"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createBusinessAndGo()}
            placeholder="Nombre de tu negocio"
            className="mt-3 h-14 text-lg"
          />

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <TerminosCheckbox checked={aceptaTerminos} onCheckedChange={setAceptaTerminos} />

          <Button
            size="lg"
            className="mt-4 w-full"
            onClick={createBusinessAndGo}
            disabled={!tipo || nombre.trim().length < 2 || !aceptaTerminos}
          >
            Iniciar mi prueba de 7 días{tipo ? ` — ${formatMoney(PRECIOS_POR_GIRO[tipo].basico)}/mes` : ""}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </main>
  );
}
