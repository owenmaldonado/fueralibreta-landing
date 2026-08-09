import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Aviso de Privacidad — FUERA LIBRETA",
  description: "Aviso de privacidad de FueraLibreta: cómo recabamos, usamos y protegemos tus datos personales.",
};

export default function AvisoPrivacidadPage() {
  return (
    <LegalPage title="Aviso de Privacidad" updated="9 de agosto de 2026">
      <p>
        FueraLibreta (&quot;nosotros&quot;), con domicilio en Tepic, Nayarit, México, es
        responsable del tratamiento de tus datos personales conforme a la Ley
        Federal de Protección de Datos Personales en Posesión de los
        Particulares. Este aviso aplica a los dueños de negocio que usan
        nuestro sistema y a las personas que interactúan con los negocios que
        lo usan (por ejemplo, al agendar una cita o hacer un pedido).
      </p>

      <h2>1. Datos que recabamos</h2>
      <ul>
        <li>Datos de identificación: nombre, nombre del negocio.</li>
        <li>Datos de contacto: teléfono, WhatsApp y correo electrónico.</li>
        <li>Datos de uso del sistema: citas, pedidos, ventas, fiados e inventario que tú o el negocio registran.</li>
        <li>Datos técnicos básicos de navegación (cookies, ver nuestra <a href="/cookies">Política de Cookies</a>).</li>
      </ul>

      <h2>2. Para qué usamos tus datos</h2>
      <ul>
        <li>Operar el sistema: agendar citas, registrar pedidos, ventas y fiados.</li>
        <li>Enviar recordatorios y confirmaciones por WhatsApp relacionados con tu cita o pedido.</li>
        <li>Dar soporte y contactarte sobre tu cuenta o demo.</li>
        <li>Mejorar el servicio y prevenir mal uso de la plataforma.</li>
      </ul>

      <h2>3. Con quién compartimos tus datos</h2>
      <p>
        No vendemos tus datos personales. Los compartimos únicamente con el
        negocio (barbería, fonda o abarrotera) con el que interactúas
        directamente, y con proveedores de infraestructura que nos ayudan a
        operar el sistema (por ejemplo, hospedaje y base de datos), bajo
        obligaciones de confidencialidad.
      </p>

      <h2>4. Tus derechos ARCO</h2>
      <p>
        Puedes solicitar acceso, rectificación, cancelación u oposición
        (derechos ARCO) sobre tus datos personales, así como revocar tu
        consentimiento, escribiéndonos por WhatsApp o correo electrónico a
        los datos de contacto que aparecen en{" "}
        <a href="/#demo">nuestra página de contacto</a>.
      </p>

      <h2>5. Cambios a este aviso</h2>
      <p>
        Podemos actualizar este aviso de privacidad. Los cambios importantes
        se publicarán en esta misma página con su fecha de actualización.
      </p>
    </LegalPage>
  );
}
