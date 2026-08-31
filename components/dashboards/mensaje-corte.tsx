"use client";

import { mensajeDiferencia, mensajeEsperado } from "@/lib/mock";
import { permisosActuales } from "@/lib/empleados";
import * as React from "react";

/**
 * El renglón de "te falta / te sobra / deberías tener $X" debajo del campo
 * de efectivo contado, en el cierre de las 3 verticales.
 *
 * Quien NO tiene `verCorteDelDia` (hoy: el rol "vendedor") hace un CONTEO A
 * CIEGAS: escribe el efectivo que contó sin ver antes cuánto "debería"
 * haber. Es como funciona cualquier caja seria, y por una razón concreta:
 * si la pantalla le dice "deberías tener $4,320" antes de capturar, alguien
 * que tomó dinero sabe exactamente qué número escribir para que cuadre, y
 * el faltante desaparece del reporte. Contando a ciegas, la diferencia real
 * queda registrada y el dueño la ve después.
 *
 * Lo que se guarda NO cambia: el cierre sigue grabando el esperado, lo
 * contado y la diferencia exacta. Esto solo decide si esa cifra se le
 * ENSEÑA a quien está capturando.
 *
 * `permisosActuales()` lee una cookie, así que se resuelve en un efecto
 * para no desalinear el primer render del servidor con el del cliente —
 * mismo patrón que puedeBorrar en app/app/pedidos/page.tsx. Mientras
 * resuelve arranca en "a ciegas": si va a cambiar, que sea de tapado a
 * destapado y no al revés, para no alcanzar a enseñar el número.
 */
export function MensajeCorte({ diferencia, esperado }: { diferencia: number | null; esperado: number }) {
  const [puedeVer, setPuedeVer] = React.useState(false);

  React.useEffect(() => {
    setPuedeVer(permisosActuales().verCorteDelDia);
  }, []);

  if (!puedeVer) {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs font-semibold">Cuenta todo el efectivo del cajón y anótalo tal cual.</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          No hagas cuentas ni le quites nada: el sistema ya sabe lo que se vendió y lo que se gastó, y hace la resta
          solo. Si no cuadra, no pasa nada — anota lo que de verdad hay.
        </p>
      </div>
    );
  }

  if (diferencia != null) {
    return (
      <p
        className={`px-1 text-xs font-medium ${
          diferencia === 0 ? "text-ledger" : diferencia < 0 ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {mensajeDiferencia(diferencia, esperado)}
      </p>
    );
  }

  return <p className="px-1 text-xs font-medium text-muted-foreground">{mensajeEsperado(esperado)}</p>;
}
