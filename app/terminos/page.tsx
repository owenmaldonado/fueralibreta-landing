import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Términos y Condiciones — FUERA LIBRETA",
  description: "Términos y condiciones de uso del sistema FueraLibreta.",
};

export default function TerminosPage() {
  return (
    <LegalPage title="Términos y Condiciones" updated="9 de agosto de 2026">
      <p>
        Estos términos regulan el uso del sistema FueraLibreta, tanto por
        parte de los negocios que lo contratan (barberías, fondas y
        abarroteras) como de sus clientes que agendan citas o hacen pedidos a
        través de nuestras páginas públicas. Al usar el sistema aceptas estos
        términos.
      </p>

      <h2>1. Uso del servicio</h2>
      <ul>
        <li>El servicio se ofrece para llevar el control de citas, pedidos, ventas, fiados e inventario de negocios en Tepic, Nayarit.</li>
        <li>Debes proporcionar información veraz al registrar una cuenta, cita o pedido.</li>
        <li>No debes usar el sistema para fines ilícitos o para afectar a otros usuarios o negocios.</li>
      </ul>

      <h2>2. Cuentas y datos del negocio</h2>
      <p>
        Cada dueño de negocio es responsable de la información que captura en
        el sistema (productos, precios, clientes, fiados). FueraLibreta no
        valida ni garantiza la exactitud de esa información frente a
        terceros.
      </p>

      <h2>3. Citas y pedidos de clientes</h2>
      <p>
        Al agendar una cita o hacer un pedido a través de la página pública de
        un negocio, aceptas que tus datos (nombre y teléfono) se compartan con
        ese negocio para poder atenderte, conforme a nuestro{" "}
        <a href="/aviso-privacidad">Aviso de Privacidad</a>. La confirmación
        final de tu cita o pedido depende del negocio.
      </p>

      <h2>4. Disponibilidad del servicio</h2>
      <p>
        Hacemos lo posible por mantener el sistema disponible, pero no
        garantizamos un funcionamiento ininterrumpido. No somos responsables
        por pérdidas derivadas de fallas técnicas ajenas a nuestro control.
      </p>

      <h2>5. Cambios a estos términos</h2>
      <p>
        Podemos actualizar estos términos en cualquier momento. El uso
        continuo del sistema después de una actualización implica su
        aceptación.
      </p>

      <h2>6. Contacto</h2>
      <p>
        Si tienes dudas sobre estos términos, contáctanos desde{" "}
        <a href="/#demo">nuestra página de contacto</a>.
      </p>
    </LegalPage>
  );
}
