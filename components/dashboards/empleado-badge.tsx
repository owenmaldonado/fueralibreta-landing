import { Badge } from "@/components/ui/badge";
import { ROL_LABEL } from "@/lib/empleados";
import type { RolEmpleado } from "@/lib/types";

/**
 * "Quién lo hizo" en una fila de venta/cita/gasto — ámbar (Badge "default")
 * para vendedor/encargado, gris (Badge "outline") para dueño. Oculto por
 * completo si el negocio nunca activó multiusuario (nombre ausente, ver
 * camposEmpleado() en lib/empleados.ts) — nunca inventa un "Dueño" donde no
 * hay ningún dato.
 */
export function EmpleadoBadge({ nombre, rol }: { nombre?: string; rol?: RolEmpleado }) {
  if (!nombre) return null;
  const esDueno = !rol || rol === "dueno";
  return (
    <Badge variant={esDueno ? "outline" : "default"}>{esDueno ? "Dueño" : `${nombre} · ${ROL_LABEL[rol]}`}</Badge>
  );
}
