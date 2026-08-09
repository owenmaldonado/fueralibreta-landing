import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Cookies — FUERA LIBRETA",
  description: "Cómo y para qué usa cookies y almacenamiento local el sistema Fuera Libreta.",
};

export default function CookiesPage() {
  return (
    <article>
      <h1>Política de Cookies</h1>
      <p className="text-sm uppercase tracking-widest text-black/50">
        Fuera Libreta · Última actualización: 8 de mayo de 2026
      </p>

      <p>
        En Fuera Libreta usamos únicamente <strong>cookies y
        almacenamiento local (localStorage) de tipo técnico</strong>, es
        decir, estrictamente necesarios para que la aplicación funcione. No
        usamos cookies de publicidad, no hacemos perfilamiento con fines de
        mercadotecnia y no compartimos esta información con terceros.
      </p>

      <h2>1. Qué son y para qué las usamos</h2>
      <p>
        Las cookies y el almacenamiento local son pequeños archivos que el
        navegador guarda en tu dispositivo para recordar información entre
        una visita y otra. En nuestro caso, se usan exclusivamente para dos
        cosas:
      </p>
      <ul>
        <li>
          <strong>Iniciar y mantener tu sesión</strong>: para que, una vez
          que inicias sesión como dueño de un negocio, la app recuerde quién
          eres y a qué negocio perteneces sin pedirte tu contraseña en cada
          pantalla.
        </li>
        <li>
          <strong>Recordar tu consentimiento de cookies</strong>: cuando
          aceptas el aviso de cookies (el banner que aparece la primera vez
          que visitas el sitio), guardamos esa decisión en tu navegador para
          no volver a mostrártelo en cada visita.
        </li>
      </ul>

      <h2>2. Lo que NO hacemos</h2>
      <ul>
        <li>No usamos cookies de publicidad ni de retargeting.</li>
        <li>No usamos pixeles ni cookies de redes sociales o de terceros.</li>
        <li>No vendemos ni compartimos esta información con anunciantes ni con ningún tercero.</li>
        <li>No construimos perfiles de comportamiento de navegación.</li>
      </ul>

      <h2>3. Cookies y almacenamiento propio (primera parte)</h2>
      <p>
        Toda la información que guardamos en tu navegador es generada y
        leída únicamente por Fuera Libreta (&quot;primera parte&quot;), nunca por
        servicios externos de análisis o publicidad. Esto incluye el token
        de sesión de autenticación y la preferencia de consentimiento de
        cookies mencionada arriba.
      </p>

      <h2>4. Cómo controlar o borrar esta información</h2>
      <p>
        Puedes borrar las cookies y el almacenamiento local de tu navegador
        en cualquier momento desde su configuración. Si lo haces, se
        cerrará tu sesión y volverá a aparecerte el aviso de cookies en tu
        siguiente visita, pero el resto del sistema seguirá funcionando con
        normalidad.
      </p>

      <p>
        Para más información sobre el tratamiento de tus datos personales,
        consulta nuestro <a href="/aviso-privacidad">Aviso de Privacidad</a>.
      </p>
    </article>
  );
}
