import { DashboardRouter } from "@/components/dashboards/dashboard-router";

/** Alias de /app: a dónde llegan los clientes normales después de loguearse (ver app/page.tsx). */
export default function InicioPage() {
  return <DashboardRouter />;
}
