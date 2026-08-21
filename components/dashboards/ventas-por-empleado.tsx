import { formatMoney } from "@/lib/mock";

export interface ResumenEmpleado {
  nombre: string;
  monto: number;
  /** Cuántos movimientos (ventas/pedidos/citas) componen ese monto — opcional, lo usa "Equipo hoy" en los dashboards (PR #121); el corte de turno/día sigue sin mandarlo. */
  cantidad?: number;
}

/**
 * Desglose "ventas de hoy" por quién las hizo (empleado_nombre_cache) —
 * punto 7 del prompt de sesión de vendedor: el corte no debe perder esta
 * info ahora que las ventas cargan empleado_id. Solo vale la pena
 * mostrarlo cuando hay más de una persona detrás de las ventas de hoy; con
 * una sola (o ninguna, negocio sin multiusuario) sería un renglón
 * redundante con el total de arriba. Reusado como "Equipo hoy" en los
 * dashboards principales (PR #121, trazabilidad vendedor/encargado) — el
 * prop `titulo` es lo único que cambia entre esos dos usos.
 */
export function VentasPorEmpleado({ datos, titulo = "Por empleado" }: { datos: ResumenEmpleado[]; titulo?: string }) {
  if (datos.length < 2) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{titulo}</p>
      {datos.map((d) => (
        <div key={d.nombre} className="flex items-center justify-between text-sm">
          <span className="text-foreground">
            {d.nombre}
            {d.cantidad != null && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({d.cantidad} venta{d.cantidad === 1 ? "" : "s"})
              </span>
            )}
          </span>
          <span className="font-mono text-muted-foreground">{formatMoney(d.monto)}</span>
        </div>
      ))}
    </div>
  );
}
