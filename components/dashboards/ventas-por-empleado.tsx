import { formatMoney } from "@/lib/mock";

/**
 * Desglose "ventas de hoy" por quién las hizo (empleado_nombre_cache) —
 * punto 7 del prompt de sesión de vendedor: el corte no debe perder esta
 * info ahora que las ventas cargan empleado_id. Solo vale la pena
 * mostrarlo cuando hay más de una persona detrás de las ventas de hoy; con
 * una sola (o ninguna, negocio sin multiusuario) sería un renglón
 * redundante con el total de arriba.
 */
export function VentasPorEmpleado({ datos }: { datos: { nombre: string; monto: number }[] }) {
  if (datos.length < 2) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Por empleado</p>
      {datos.map((d) => (
        <div key={d.nombre} className="flex items-center justify-between text-sm">
          <span className="text-foreground">{d.nombre}</span>
          <span className="font-mono text-muted-foreground">{formatMoney(d.monto)}</span>
        </div>
      ))}
    </div>
  );
}
