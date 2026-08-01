import { AuthenticatedShell } from "@/components/app-shell/authenticated-shell";
import { DashboardRouter } from "@/components/dashboards/dashboard-router";

/**
 * El sistema del negocio logueado, para mostrarse directamente en "/"
 * cuando ya hay sesión (ver app/page.tsx). Es el mismo shell + dashboard
 * que /app, reutilizados en vez de duplicados.
 */
export function App() {
  return (
    <AuthenticatedShell>
      <DashboardRouter />
    </AuthenticatedShell>
  );
}
