/**
 * Bloqueo de scroll del body compartido entre Dialog y Sheet (components/ui).
 *
 * Antes cada uno guardaba `document.body.style.overflow` al abrir y lo
 * restauraba a ESE valor al cerrar — funciona con un solo modal, pero un
 * Sheet con un Dialog/ConfirmDialog encima (patrón usado en toda la app:
 * ej. "Eliminar fiado" sobre la ficha del cliente, o un dialog de admin
 * abriendo otro) no siempre se cierra en el mismo orden en que se abrió.
 * Si el de AFUERA cerraba primero, su cleanup restauraba overflow a "" —
 * bien, pero el de ADENTRO seguía abierto y necesitaba seguir bloqueado.
 * Peor: si el de AFUERA cerraba DESPUÉS del de adentro, su cleanup
 * restauraba overflow al valor que había capturado ANTES de abrirse
 * ("hidden", porque el de adentro ya lo había puesto así) — dejando
 * `overflow: hidden` pegado en el body PARA SIEMPRE, sin ningún modal
 * abierto. Eso es "Admin no scrollea" (o cualquier pantalla de /app/*
 * después de cerrar un ConfirmDialog sobre un Sheet): no era ningún
 * h-screen/overflow-hidden en el layout, era este bug.
 *
 * Un contador compartido lo evita sin importar el orden: el body solo se
 * desbloquea cuando el ÚLTIMO modal abierto (de cualquiera de los dos
 * tipos) se cierra.
 */
let overlaysAbiertos = 0;

/** Llamar al abrir un modal; devuelve la función de limpieza a llamar al cerrarlo (uso típico: dentro de un useEffect, como su return). */
export function lockBodyScroll(): () => void {
  overlaysAbiertos += 1;
  document.body.style.overflow = "hidden";
  return () => {
    overlaysAbiertos = Math.max(0, overlaysAbiertos - 1);
    if (overlaysAbiertos === 0) document.body.style.overflow = "";
  };
}
