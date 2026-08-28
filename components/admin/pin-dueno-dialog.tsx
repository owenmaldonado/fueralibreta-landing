"use client";

import * as React from "react";
import { toast } from "sonner";

import { Dialog, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { AdminNegocio } from "@/lib/admin-data";

/**
 * Reiniciar el PIN de dueño de un negocio desde el panel de admin.
 *
 * POR QUÉ EXISTE ESTA PANTALLA
 * El flujo anterior para un dueño que olvidaba su PIN era "Olvidé mi PIN" →
 * magic link a su correo → al volver, la app le borraba el PIN. En la
 * práctica ese correo lo deja en la pantalla de login de Supabase y ahí se
 * atora. Ahora el camino es directo: te escribe por WhatsApp y tú le pones
 * uno nuevo desde aquí en 5 segundos.
 *
 * NO SE PUEDE "VER" EL PIN, Y NO ES UN DESCUIDO
 * El PIN se guarda hasheado con bcrypt (crypt/gen_salt en Postgres, ver
 * negocio_pin_dueno). Un hash no se puede revertir: ni esta pantalla, ni la
 * base, ni yo podemos leer el PIN que el dueño eligió. Y así debe quedarse
 * — un PIN de 4 dígitos son 10 mil combinaciones, guardarlo en claro para
 * poder mostrarlo aquí significaría que cualquier fuga de la base entrega
 * los PINs de todos los negocios de una. Lo único posible, y lo que hace
 * esta pantalla, es ESCRIBIR uno nuevo encima.
 *
 * Todo el trabajo lo hacen funciones security definer que verifican
 * is_admin() del lado de Postgres (admin_set_pin_dueno /
 * admin_borrar_pin_dueno, migración 20260914000000) — no basta con que esta
 * pantalla solo la abra un admin en el navegador.
 */
export function PinDuenoDialog({ negocio, onClose }: { negocio: AdminNegocio | null; onClose: () => void }) {
  const [pin, setPin] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);
  const [configurado, setConfigurado] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setPin("");
    setConfigurado(null);
    if (!negocio) return;
    let cancelado = false;
    supabase
      .rpc("admin_pin_dueno_configurado", { p_negocio_id: negocio.id })
      .then(({ data, error }) => {
        if (cancelado) return;
        // Si la consulta falla no se bloquea la pantalla: poner un PIN nuevo
        // funciona igual sin saber si ya había uno.
        setConfigurado(error ? null : Boolean(data));
      });
    return () => {
      cancelado = true;
    };
  }, [negocio]);

  const pinValido = /^\d{4}$/.test(pin);

  /** 4 dígitos al azar, sin los obvios (0000, 1234...) — mismo criterio que el generador de PIN de empleados. */
  function sugerir() {
    const obvios = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321"]);
    let candidato = "";
    do {
      candidato = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    } while (obvios.has(candidato));
    setPin(candidato);
  }

  async function guardar() {
    if (!negocio || !pinValido) return;
    setGuardando(true);
    try {
      const { error } = await supabase.rpc("admin_set_pin_dueno", { p_negocio_id: negocio.id, p_pin: pin });
      if (error) throw error;
      toast.success(`PIN de ${negocio.nombre}: ${pin} — pásaselo por WhatsApp.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el PIN.");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    if (!negocio) return;
    setGuardando(true);
    try {
      const { error } = await supabase.rpc("admin_borrar_pin_dueno", { p_negocio_id: negocio.id });
      if (error) throw error;
      toast.success("PIN quitado — el dueño puede configurar uno nuevo desde Ajustes > Empleados.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo quitar el PIN.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={!!negocio} onOpenChange={(o) => !o && onClose()} className="max-w-sm">
      <DialogHeader
        title="PIN de dueño"
        description={negocio ? `Para ${negocio.nombre}. Es el PIN con el que vuelve a modo Dueño en el selector de turno.` : undefined}
        onClose={onClose}
      />
      <div className="space-y-3">
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          El PIN actual no se puede ver: se guarda cifrado y no hay forma de revertirlo. Lo que sí puedes es ponerle uno nuevo aquí
          y dictárselo.
          {configurado === true && " Ahorita este negocio ya tiene un PIN configurado."}
          {configurado === false && " Ahorita este negocio no tiene ningún PIN configurado."}
        </p>
        <div className="space-y-1.5">
          <Label>PIN nuevo (4 dígitos)</Label>
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Ej. 4821"
              className="font-mono tracking-[0.4em]"
            />
            <Button type="button" variant="outline" onClick={sugerir} className="shrink-0">
              Sugerir
            </Button>
          </div>
        </div>
      </div>
      <DialogFooter>
        {configurado === true && (
          <Button variant="outline" onClick={quitar} disabled={guardando}>
            Quitar PIN
          </Button>
        )}
        <Button onClick={guardar} disabled={!pinValido || guardando}>
          {guardando ? "Guardando..." : "Poner este PIN"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
