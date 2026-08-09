import Link from "next/link";

/**
 * Footer compartido por las páginas públicas de la web (landing, demo y las
 * páginas de reserva/pedido /b/[slug]). Distinto del footer de las páginas
 * legales (LegalPage), que va en fondo blanco.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="container flex flex-col items-center justify-between gap-4 py-8 font-mono text-xs uppercase tracking-widest text-muted-foreground sm:flex-row">
        <span>
          Fuera<span className="text-primary">Libreta</span> · Tepic, Nayarit
        </span>
        <nav className="flex items-center gap-3 normal-case tracking-normal">
          <Link href="/aviso-privacidad" className="transition-colors hover:text-foreground">
            Aviso de Privacidad
          </Link>
          <span aria-hidden>|</span>
          <Link href="/terminos" className="transition-colors hover:text-foreground">
            Términos y Condiciones
          </Link>
        </nav>
        <span>© {new Date().getFullYear()} — Hecho a mano, sin libreta</span>
      </div>
    </footer>
  );
}
