import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Layout compartido para las páginas legales públicas (/aviso-privacidad,
 * /terminos, /cookies). A propósito NO usa el tema oscuro del resto de la
 * app (bg-background es oscuro): estas páginas van con fondo blanco y
 * texto negro fijos, como una hoja legal impresa, sin depender de
 * --background/--foreground.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-white text-black">
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

      <article className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-black/50">
          Última actualización: {updated}
        </p>

        <div className="prose-legal mt-10 flex flex-col gap-6 text-sm leading-relaxed text-black/80 [&_a]:text-amber-700 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-black [&_li]:ml-5 [&_li]:list-disc [&_p]:text-black/80 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
          {children}
        </div>
      </article>

      <footer className="border-t border-black/10">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-black/50 sm:flex-row">
          <span>FueraLibreta · Tepic, Nayarit</span>
          <nav className="flex items-center gap-3">
            <Link href="/aviso-privacidad" className="hover:text-black hover:underline">
              Aviso de Privacidad
            </Link>
            <span aria-hidden>·</span>
            <Link href="/terminos" className="hover:text-black hover:underline">
              Términos y Condiciones
            </Link>
            <span aria-hidden>·</span>
            <Link href="/cookies" className="hover:text-black hover:underline">
              Cookies
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
