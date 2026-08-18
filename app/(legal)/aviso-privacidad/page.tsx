import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aviso de Privacidad — FUERA LIBRETA",
  description:
    "Aviso de privacidad de Fuera Libreta conforme a la LFPDPPP: qué datos recabamos, para qué los usamos y cómo ejercer tus derechos ARCO.",
};

export default function AvisoPrivacidadPage() {
  return (
    <article>
      <h1>Aviso de Privacidad</h1>
      <p className="text-sm uppercase tracking-widest text-black/50">
        Fuera Libreta · Última actualización: 8 de mayo de 2026
      </p>

      <h2>1. Identidad y domicilio del responsable</h2>
      <p>
        Owen Maldonado, en operación bajo el nombre comercial <strong>Fuera
        Libreta</strong> (&quot;Fuera Libreta&quot;, &quot;nosotros&quot; o &quot;el
        responsable&quot;), con domicilio en Testerazo, Nayarit, México, es
        responsable del tratamiento de tus datos personales conforme a lo
        dispuesto por la Ley Federal de Protección de Datos Personales en
        Posesión de los Particulares (LFPDPPP) y su Reglamento. Para
        cualquier duda sobre este aviso puedes escribirnos a{" "}
        <a href="mailto:contacto@fueralibreta.com">contacto@fueralibreta.com</a>.
      </p>

      <h2>2. Datos personales que recabamos</h2>
      <p>
        Fuera Libreta es un sistema de gestión (SaaS) que usan negocios de
        Tepic y la zona (barberías, fondas y abarroteras) para dejar de
        llevar su control en libreta. Dependiendo de tu relación con el
        servicio, podemos recabar:
      </p>
      <ul>
        <li>
          <strong>Datos del cliente final</strong> (la persona que agenda una
          cita o hace un pedido con un negocio que usa Fuera Libreta): nombre
          y número de teléfono / WhatsApp.
        </li>
        <li>
          <strong>Datos del negocio y su dueño</strong>: nombre del negocio,
          nombre del titular de la cuenta, teléfono, correo electrónico y,
          en su caso, dirección del establecimiento.
        </li>
        <li>
          <strong>Datos operativos del negocio</strong>: ventas, fiados,
          citas, pedidos, inventario y demás información que el dueño
          captura para administrar su propio negocio dentro de la app.
        </li>
      </ul>
      <p>No recabamos datos personales sensibles ni datos financieros como números de tarjeta.</p>

      <h2>3. Finalidades del tratamiento</h2>
      <p>Tus datos personales se utilizan para las siguientes finalidades, necesarias para el servicio:</p>
      <ul>
        <li>Operar la aplicación y las funciones que contrataste o que usas como cliente de un negocio afiliado.</li>
        <li>Registrar ventas, fiados, citas y pedidos, y generar las gráficas y reportes del negocio.</li>
        <li>Enviar recordatorios de citas, confirmaciones de pedidos y avisos operativos por WhatsApp.</li>
        <li>Dar soporte técnico y atender aclaraciones sobre tu cuenta o tu cita/pedido.</li>
      </ul>
      <p>
        No usamos tus datos personales con fines de mercadotecnia de
        terceros ajenos a Fuera Libreta y al negocio con el que
        interactuaste directamente.
      </p>

      <h2>4. Transferencia de datos y no venta</h2>
      <p>
        <strong>No vendemos, rentamos ni comercializamos tus datos
        personales</strong> con nadie. Compartimos datos únicamente con el
        negocio con el que tú, como cliente final, decides interactuar
        (para que pueda atender tu cita o pedido), y con proveedores de
        infraestructura tecnológica que operan el servicio en nuestro
        nombre, bajo obligaciones contractuales de confidencialidad. Tus
        datos se almacenan en servidores de Supabase Inc. ubicados en
        Estados Unidos, lo que implica una transferencia internacional de
        datos personales necesaria para la prestación del servicio; dicho
        proveedor está sujeto a obligaciones contractuales de
        confidencialidad y seguridad equivalentes a las que aplicamos
        nosotros mismos, conforme al artículo 36 y demás disposiciones
        aplicables de la LFPDPPP sobre transferencias.
      </p>

      <h2>5. Almacenamiento y medidas de seguridad</h2>
      <p>
        Tus datos se almacenan en Supabase, proveedor de base de datos e
        infraestructura en la nube que utiliza cifrado en tránsito y en
        reposo. Aplicamos controles de acceso para que cada negocio solo
        pueda ver la información de sus propios clientes y operaciones, y
        adoptamos medidas administrativas, técnicas y físicas razonables
        para proteger tus datos contra daño, pérdida, alteración,
        destrucción o uso, acceso o tratamiento no autorizado.
      </p>

      <h2>6. Derechos ARCO</h2>
      <p>
        Tienes derecho a Acceder, Rectificar y Cancelar tus datos
        personales, así como a Oponerte al tratamiento de los mismos o a
        revocar el consentimiento que en su caso nos hayas otorgado
        (derechos ARCO). Para ejercerlos, envía tu solicitud a{" "}
        <a href="mailto:contacto@fueralibreta.com">contacto@fueralibreta.com</a>{" "}
        indicando tu nombre, el dato sobre el que quieres ejercer tu derecho
        y una identificación que acredite tu identidad. Daremos respuesta a
        tu solicitud en un plazo máximo de <strong>48 horas</strong>.
      </p>

      <h2>7. Uso de cookies y tecnologías similares</h2>
      <p>
        Utilizamos únicamente almacenamiento local técnico necesario para
        que la aplicación funcione (sesión y preferencia de cookies). Puedes
        consultar el detalle en nuestra{" "}
        <a href="/cookies">Política de Cookies</a>.
      </p>

      <h2>8. Uso de automatización e inteligencia artificial</h2>
      <p>
        Fuera Libreta puede usar plantillas y asistencia automatizada
        (incluyendo herramientas de inteligencia artificial) para ayudar a
        generar borradores de mensajes de recordatorio, confirmación u
        otros textos operativos dentro de la plataforma, a partir de los
        datos operativos del negocio (cláusula 2). Estas herramientas son
        un apoyo para el negocio: no suplantan ni sustituyen la
        comunicación humana directa entre el negocio y sus clientes, y no
        se usan para tomar decisiones automatizadas que produzcan efectos
        jurídicos sobre ti sin intervención humana.
      </p>

      <h2>9. Cambios a este aviso de privacidad</h2>
      <p>
        Nos reservamos el derecho de actualizar este aviso de privacidad en
        cualquier momento, por ejemplo ante cambios en nuestras prácticas o
        por requerimientos legales. Cualquier modificación se publicará en
        esta misma página con su fecha de actualización, y te recomendamos
        revisarla periódicamente.
      </p>
    </article>
  );
}
