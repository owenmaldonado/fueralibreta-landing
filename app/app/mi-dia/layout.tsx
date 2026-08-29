import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { redirect } from "next/navigation";

import { ShellMiDia } from "@/components/personal/shell";
import { ProveedorTema, SCRIPT_TEMA_INICIAL } from "@/components/personal/tema";
import { ADMIN_EMAIL } from "@/lib/admin-data";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase-server";

import "./mi-dia.css";

/**
 * App personal "Mi Día" — /app/mi-dia.
 *
 * DÓNDE VIVE Y POR QUÉ NO CHOCA CON NADA:
 *
 * `/app/*` está envuelto por app/app/layout.tsx -> AuthenticatedShell. Ese
 * shell solo se pinta para las rutas de NEGOCIO (ver SEGMENTOS_DE_NEGOCIO en
 * components/app-shell/authenticated-shell.tsx); para cualquier otro segmento
 * regresa `<>{children}</>` tal cual. "mi-dia" no está en esa lista, así que
 * esta app renderiza sin TopBar, sin BottomNav, sin FAB y sin el gate de
 * sesión-de-negocio de FueraLibreta. Lo mismo del lado del edge: middleware.ts
 * usa la misma lista para el bloqueo por trial/plan vencido, así que un trial
 * vencido de un negocio de prueba jamás puede dejarte fuera de tu propia app.
 *
 * Eso significa que aquí NO hay ninguna puerta puesta por FueraLibreta — la
 * puerta la pone este layout, abajo, y es más estrecha: solo tu cuenta.
 *
 * Nada de este árbol importa nada de FueraLibreta salvo tres cosas de solo
 * lectura y sin efectos: el cliente de Supabase, ADMIN_EMAIL y los primitivos
 * de components/ui.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi Día",
  description: "Agenda, hábitos, gym, dinero y ánimo — en una sola hoja por día.",
};

// Serif editorial para títulos y números grandes. Es lo que separa un planner
// de un dashboard: el cuerpo sigue en Inter (--font-sans, ya cargada por el
// layout raíz), así que esto suma una sola fuente al bundle, no dos.
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mid-display",
});

export default async function LayoutMiDia({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Puerta server-side y por email. La app personal es de una sola persona:
  // cualquier otra cuenta logueada (incluido un dueño de negocio cualquiera)
  // sale de aquí antes de que se renderice una sola línea. La defensa de
  // verdad de todos modos es la RLS de las tablas personal_* (owner_id =
  // auth.uid()): aunque alguien se saltara esto, no vería ni una fila tuya.
  if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) redirect("/app/inicio");

  return (
    <div className={fraunces.variable}>
      {/* Pone el tema antes del primer pintado; sin esto el modo papel
          parpadea en oscuro mientras React hidrata. */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      <ProveedorTema claseFuente={fraunces.variable}>
        <ShellMiDia>{children}</ShellMiDia>
      </ProveedorTema>
    </div>
  );
}
