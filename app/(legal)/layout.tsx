import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Chrome compartido de las páginas legales públicas (/aviso-privacidad,
 * /terminos, /cookies). A propósito NO usa el tema oscuro del resto de la
 * app (bg-background es oscuro): estas páginas van con fondo blanco y
 * texto negro fijos, como una hoja legal impresa, sin depender de
 * --background/--foreground.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b border-black/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-display text-base font-bold tracking-tight">
            FUERA<span className="text-amber-600">LIBRETA</span>
          </Link>
          <Link href="/" className="text-xs text-black/60 underline-offset-2 hover:underline">
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="prose prose-neutral mx-auto max-w-3xl px-6 py-20 prose-headings:font-display prose-headings:tracking-tight prose-a:text-amber-700 prose-a:underline-offset-2">
        {children}
      </main>

      <footer className="border-t border-black/10">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-black/50 sm:flex-row">
          <span>FueraLibreta · Tepic, Nayarit</span>
          <nav className="flex items-center gap-2">
            <Link href="/aviso-privacidad" className="hover:text-black hover:underline">
              Aviso de Privacidad
            </Link>
            <span aria-hidden>|</span>
            <Link href="/terminos" className="hover:text-black hover:underline">
              Términos y Condiciones
            </Link>
            <span aria-hidden>|</span>
            <Link href="/cookies" className="hover:text-black hover:underline">
              Cookies
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
