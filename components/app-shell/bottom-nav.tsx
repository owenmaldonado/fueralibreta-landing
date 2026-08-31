"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, Users, Wallet, Settings, ClipboardList, UtensilsCrossed, Receipt, Boxes, HandCoins, CreditCard } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BusinessType, RolEmpleado } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  /** Uno de los dos: ícono de lucide o un emoji (ej. Frutas y Verdura usa 🥑). */
  icon?: React.ComponentType<{ className?: string }>;
  emoji?: string;
}

const NAV_BARBERIA: NavItem[] = [
  { href: "/app/inicio", label: "Hoy", icon: Home },
  { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/app/clientes", label: "Clientes", icon: Users },
  { href: "/app/caja", label: "Caja", icon: Wallet },
  { href: "/app/mas", label: "Más", icon: Settings },
  { href: "/app/mi-plan", label: "Mi Plan", icon: CreditCard },
];

// Fonda y Abarrotera NO llevan "Más", y esa pestaña se quitó a propósito.
//
// Owen: "las opciones de configuración de fonda y abarrotera, me gustaría
// que no estén al menos ahora, ya que solo guardan la sección de usuarios
// con PIN, lo que ya tienen un botón directo arriba a la derecha, y esa
// sección de disque configuración no me sirve de nada".
//
// Tiene razón y es fácil de comprobar: después de sacar de ahí Productos y
// Configuración (que llevaban a pantallas de barbería y daban error) y de
// mover Cierres a Mi Plan, a estos dos giros les quedaba UNA sola entrada,
// Empleados — y ese botón vive siempre en la barra de arriba (ver
// accederEmpleados en components/app-shell/top-bar.tsx). Una pestaña entera
// para repetir un botón que ya está a la vista solo gasta un espacio de los
// pocos que hay abajo.
//
// Barbería SÍ la conserva: ahí "Más" tiene Servicios, Productos,
// Configuración, Empleados e Historial — cinco pantallas de verdad que no
// están en ningún otro lado.
const NAV_FONDA: NavItem[] = [
  { href: "/app/inicio", label: "Hoy", icon: Home },
  { href: "/app/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/app/menu", label: "Menú", icon: UtensilsCrossed },
  { href: "/app/gastos", label: "Gastos", icon: Receipt },
  { href: "/app/mi-plan", label: "Mi Plan", icon: CreditCard },
];

const NAV_ABARROTES: NavItem[] = [
  { href: "/app/inicio", label: "Hoy", icon: Home },
  { href: "/app/inventario", label: "Inventario", icon: Boxes },
  { href: "/app/fiados", label: "Fiados", icon: HandCoins },
  { href: "/app/frutas-verdura", label: "Frutas y Verdura", emoji: "🥑" },
  { href: "/app/gastos", label: "Gastos", icon: Receipt },
  { href: "/app/mi-plan", label: "Mi Plan", icon: CreditCard },
];

const NAV_BY_TYPE: Record<BusinessType, NavItem[]> = {
  barberia: NAV_BARBERIA,
  fonda: NAV_FONDA,
  abarrotes: NAV_ABARROTES,
};

// Reportes financieros (Gastos/Caja): totales acumulados, ganancia
// histórica y gráficas. Ahora se ocultan a TODO el que no sea dueño, no
// solo al vendedor — antes el encargado sí los veía aquí, cosa que
// contradecía su propio rol (PERMISOS.encargado tiene
// verGananciasHistoricas y verGraficasCompletas en false, lib/empleados.ts)
// y que además ya no coincide con el middleware, que desde ahora rebota
// esas dos rutas para cualquier no-dueño. Mostrar una pestaña que al
// tocarla rebota es peor que no mostrarla.
//
// Registrar un gasto o una venta no se pierde: eso vive en el botón + del
// FAB, disponible para todos los roles.
const HREFS_REPORTES = new Set(["/app/gastos", "/app/caja"]);

export function BottomNav({ tipo, rolActual }: { tipo: BusinessType; rolActual?: RolEmpleado }) {
  const pathname = usePathname();
  const items = NAV_BY_TYPE[tipo].filter((item) => {
    // rolActual undefined = dueño puro (nadie eligió empleado en este
    // dispositivo): ve todo.
    if (!rolActual || rolActual === "dueno") return true;
    if (HREFS_REPORTES.has(item.href)) return false;
    if (rolActual !== "vendedor") return true;
    // "Cerrar turno"/"Cerrar día" para vendedor vive en el botón rojo de
    // TurnoControl en las 3 verticales (ver components/app-shell/
    // turno-control.tsx), no en Mi Plan — que ahí ya no le ofrece nada, así
    // que ni se muestra el link.
    if (item.href === "/app/mi-plan") return false;
    return true;
  });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-center text-[11px] font-medium leading-tight transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {item.emoji ? <span className="text-base leading-none">{item.emoji}</span> : Icon && <Icon className="h-5 w-5" />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
