import Link from "next/link";
import {
  Scissors,
  UtensilsCrossed,
  ShoppingBasket,
  Check,
  MessageCircle,
  Smartphone,
  MapPin,
  LogIn,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ContactForm } from "@/components/contact-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { WA_CONTACTO } from "@/lib/mock";

const NEGOCIOS = [
  {
    tipo: "barberia",
    icon: Scissors,
    nombre: "Barberías",
    problema: "Cortes fiados anotados en la libreta que nadie encuentra el día de pago.",
    features: [
      "Agenda de citas por barbero",
      "Control de cortes fiados y abonos",
      "Recordatorios automáticos por WhatsApp",
    ],
  },
  {
    tipo: "fonda",
    icon: UtensilsCrossed,
    nombre: "Fondas",
    problema: "Comandas en papelitos sueltos y el corte del día cuadrado a mano.",
    features: [
      "Comandas digitales para la cocina",
      "Corte de caja automático",
      "Menú del día editable desde el celular",
    ],
  },
  {
    tipo: "abarrotes",
    icon: ShoppingBasket,
    nombre: "Abarrotes",
    problema: "El fiado de los caseros lleno de tachones y páginas arrancadas.",
    features: [
      "Punto de venta con código de barras",
      "Control de fiado por cliente",
      "Inventario que avisa cuando algo se acaba",
    ],
  },
] as const;

function TachadoLibreta() {
  return (
    <span className="relative inline-block">
      LIBRETA
      <svg
        className="pointer-events-none absolute -inset-x-2 inset-y-0 h-full w-[calc(100%+1rem)]"
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M2 15 C 25 9, 45 19, 70 8 S 95 12, 98 9"
          fill="none"
          stroke="hsl(var(--destructive))"
          strokeWidth="3.2"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          className="animate-strike-in [stroke-dashoffset:1]"
        />
        <path
          d="M3 10 C 30 18, 50 6, 72 17 S 94 8, 97 14"
          fill="none"
          stroke="hsl(var(--destructive))"
          strokeWidth="2.4"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          className="animate-strike-in [stroke-dashoffset:1] [animation-delay:0.55s]"
        />
      </svg>
    </span>
  );
}

/** Landing pública de fueralibreta.com (usuario sin sesión). */
export function Landing() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <span className="font-display text-lg font-bold tracking-tight">
            FUERA<span className="text-primary">LIBRETA</span>
          </span>
          <nav className="hidden items-center gap-8 font-mono text-xs uppercase tracking-widest text-muted-foreground md:flex">
            <Link href="#servicios" className="transition-colors hover:text-foreground">
              Servicios
            </Link>
            <Link href="#demo" className="transition-colors hover:text-foreground">
              Contacto
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <GoogleSignInButton variant="ghost" size="sm" redirectTo="/onboarding" className="hidden gap-1.5 sm:inline-flex">
              <LogIn className="h-3.5 w-3.5" />
              ¿Ya tienes una cuenta? Inicia sesión
            </GoogleSignInButton>
            <Button asChild size="sm">
              <Link href="#demo">Ver Demo</Link>
            </Button>
          </div>
        </div>
        <div className="container flex justify-end pb-3 sm:hidden">
          <GoogleSignInButton variant="ghost" size="sm" redirectTo="/onboarding" className="gap-1.5 text-xs">
            <LogIn className="h-3.5 w-3.5" />
            ¿Ya tienes cuenta? Inicia sesión
          </GoogleSignInButton>
        </div>
      </header>

      {/* Hero */}
      <section className="ruled-bg margin-rule relative border-b border-border/60">
        <div className="container flex flex-col items-start gap-6 py-24 pl-20 sm:py-32 sm:pl-24">
          <Badge variant="ledger" className="gap-1.5">
            <MapPin className="h-3 w-3" /> Tepic, Nayarit
          </Badge>

          <h1 className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-7xl md:text-8xl">
            Fuera
            <br />
            <TachadoLibreta />
          </h1>

          <p className="max-w-xl font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-base">
            Sistemas para negocios de Tepic
          </p>

          <p className="max-w-lg text-balance text-base text-muted-foreground sm:text-lg">
            Barberías, fondas y abarrotes de Tepic dejan de anotar fiados,
            comandas e inventario en papel. Todo queda en el celular, cuadrado
            y a la mano.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg">
              <Link href="#servicios">Ver Demo</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={WA_CONTACTO} target="_blank">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Link>
            </Button>
          </div>

          <dl className="flex flex-wrap gap-x-10 gap-y-4 pt-8 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <div>
              <dt className="text-primary">03</dt>
              <dd>Rubros de negocio</dd>
            </div>
            <div>
              <dt className="text-primary">100%</dt>
              <dd>Desde tu celular</dd>
            </div>
            <div>
              <dt className="text-primary">0</dt>
              <dd>Páginas arrancadas</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="container py-24 sm:py-32">
        <div className="mb-14 flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-primary">
            Elige tu rubro
          </span>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Un sistema hecho para tu tipo de negocio
          </h2>
          <p className="max-w-2xl text-muted-foreground">
            Cada negocio lleva su libreta distinto. Por eso armamos una demo
            pensada para lo que tú vives todos los días.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {NEGOCIOS.map(({ tipo, icon: Icon, nombre, problema, features }, i) => (
            <Card
              key={nombre}
              className="perforation group relative flex flex-col justify-between overflow-hidden border-dashed border-border bg-card/60 pt-1 transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_0_30px_-10px_hsl(var(--primary)/0.35)]"
              style={{ backgroundPositionY: "-2px" }}
            >
              <div>
                <CardHeader>
                  <span className="font-mono text-xs text-muted-foreground">
                    0{i + 1}
                  </span>
                  <div className="mt-2 flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="pt-3">{nombre}</CardTitle>
                  <CardDescription>{problema}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2.5">
                  {features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-ledger" />
                      <span>{f}</span>
                    </div>
                  ))}
                </CardContent>
              </div>
              <CardContent className="pt-2">
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/demo/${tipo}`}>Ver Demo {nombre}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Demo / Contacto */}
      <section id="demo" className="border-t border-border/60 bg-surface/40">
        <div className="container grid gap-16 py-24 sm:py-32 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <span className="font-mono text-xs uppercase tracking-widest text-primary">
              Agenda tu demo
            </span>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Te la explicamos en 15 minutos, en tu negocio o por videollamada
            </h2>
            <p className="max-w-md text-muted-foreground">
              Sin instalaciones raras ni contratos largos. Vemos tu negocio,
              te mostramos el sistema funcionando con tus propios productos o
              servicios, y tú decides.
            </p>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card/60 p-4">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-ledger" />
              <p className="text-sm text-muted-foreground">
                Funciona en cualquier celular Android o iPhone, sin comprar
                equipo nuevo.
              </p>
            </div>
          </div>

          <Card className="border-border bg-card p-2 sm:p-4">
            <CardContent className="pt-6">
              <ContactForm />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 font-mono text-xs uppercase tracking-widest text-muted-foreground sm:flex-row">
          <span>
            Fuera<span className="text-primary">Libreta</span> · Tepic, Nayarit
          </span>
          <span>© {new Date().getFullYear()} — Hecho a mano, sin libreta</span>
        </div>
      </footer>
    </main>
  );
}
