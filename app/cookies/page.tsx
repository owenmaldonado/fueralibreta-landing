import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Política de Cookies — FUERA LIBRETA",
  description: "Cómo y para qué usa cookies el sistema FueraLibreta.",
};

export default function CookiesPage() {
  return (
    <LegalPage title="Política de Cookies" updated="9 de agosto de 2026">
      <p>
        Usamos cookies y almacenamiento local del navegador para que el
        sistema FueraLibreta funcione correctamente. Esta página explica qué
        cookies usamos y por qué.
      </p>

      <h2>1. Cookies esenciales</h2>
      <p>
        Necesarias para mantener tu sesión iniciada y para que la app
        funcione (por ejemplo, recordar qué negocio estás usando). Sin ellas
        el sistema no puede operar, por lo que no requieren tu consentimiento
        para activarse, solo para informarte de su uso.
      </p>

      <h2>2. Almacenamiento local</h2>
      <p>
        Usamos el almacenamiento local de tu navegador para guardar
        información temporal, como una demo antes de que crees tu cuenta, o
        que ya aceptaste este aviso de cookies, para no volver a
        mostrártelo.
      </p>

      <h2>3. Cookies de terceros</h2>
      <p>
        Actualmente no usamos cookies de publicidad ni de rastreo de
        terceros.
      </p>

      <h2>4. Cómo controlar las cookies</h2>
      <p>
        Puedes borrar las cookies y el almacenamiento local desde la
        configuración de tu navegador en cualquier momento. Ten en cuenta que
        algunas funciones del sistema pueden dejar de funcionar
        correctamente si las desactivas.
      </p>

      <p>
        Para más información sobre el tratamiento de tus datos, revisa
        nuestro <a href="/aviso-privacidad">Aviso de Privacidad</a>.
      </p>
    </LegalPage>
  );
}
