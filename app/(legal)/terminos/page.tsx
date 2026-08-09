import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones — FUERA LIBRETA",
  description: "Términos y condiciones de uso del sistema Fuera Libreta.",
};

export default function TerminosPage() {
  return (
    <article>
      <h1>Términos y Condiciones</h1>
      <p className="text-sm uppercase tracking-widest text-black/50">
        Fuera Libreta · Última actualización: 8 de mayo de 2026
      </p>

      <p>
        Estos Términos y Condiciones (&quot;Términos&quot;) regulan el uso de
        Fuera Libreta, operado por Owen Maldonado en Testerazo, Nayarit,
        México, tanto por los negocios que contratan el servicio (barberías,
        fondas y abarroteras) como por sus clientes finales que agendan
        citas o realizan pedidos a través de nuestras páginas públicas. Al
        crear una cuenta, contratar el servicio o usar cualquiera de
        nuestras páginas públicas, aceptas estos Términos en su totalidad.
      </p>

      <h2>1. Naturaleza del servicio: SaaS de intermediación</h2>
      <p>
        Fuera Libreta es un servicio de software como plataforma (SaaS) que
        pone a disposición de negocios locales herramientas para gestionar
        ventas, fiados, citas, pedidos e inventario, y que funciona como
        intermediario tecnológico entre el negocio y sus propios clientes.
        No somos parte de la relación comercial entre el negocio y su
        cliente final: no vendemos los productos ni prestamos los servicios
        que ofrece cada negocio, y no somos responsables de la calidad,
        precio, cumplimiento o legalidad de dichos productos o servicios.
      </p>

      <h2>2. Disponibilidad del servicio</h2>
      <p>
        Hacemos esfuerzos razonables por mantener la plataforma disponible y
        funcionando correctamente, pero <strong>no garantizamos un
        funcionamiento ininterrumpido al 100%</strong>. Pueden existir
        interrupciones por mantenimiento, fallas técnicas, causas de fuerza
        mayor o hechos de terceros (incluyendo proveedores de
        infraestructura o de mensajería como WhatsApp) fuera de nuestro
        control razonable, sin que ello genere responsabilidad para Fuera
        Libreta.
      </p>

      <h2>3. Cuentas y datos de demostración</h2>
      <p>
        Ofrecemos cuentas de demostración para que un negocio pruebe el
        sistema antes de activarlo formalmente. Las cuentas o negocios de
        demostración que permanezcan <strong>sin actividad durante 90 días
        naturales</strong> podrán ser eliminados de forma permanente, sin
        previo aviso, junto con la información capturada en ellas.
        Recomendamos activar tu cuenta o exportar tu información antes de
        ese plazo si deseas conservarla.
      </p>

      <h2>4. Uso prohibido</h2>
      <p>
        Queda estrictamente prohibido usar Fuera Libreta para: (i) enviar
        mensajes masivos no solicitados o spam a través de las funciones de
        recordatorio o notificación; (ii) cualquier actividad ilegal
        conforme a la legislación mexicana aplicable; y (iii) revender,
        sublicenciar o poner a disposición de terceros el acceso a la
        plataforma sin nuestra autorización expresa por escrito.
        Detectar cualquiera de estas conductas es causa de suspensión
        inmediata de la cuenta conforme a la cláusula 7.
      </p>

      <h2>5. Limitación de responsabilidad</h2>
      <p>
        Fuera Libreta no es responsable por la <strong>pérdida de ventas,
        clientes u oportunidades de negocio</strong> derivadas de fallas de
        conectividad a internet, del dispositivo del usuario, de terceros
        proveedores de mensajería, o de cualquier circunstancia ajena al
        control directo de la plataforma. Nuestra responsabilidad total
        frente al negocio, en cualquier caso, se limita al monto
        efectivamente pagado por el servicio en los tres meses previos al
        hecho que la origina.
      </p>

      <h2>6. Consentimiento del negocio frente a sus propios clientes</h2>
      <p>
        Cada negocio que usa Fuera Libreta es <strong>el único responsable
        de contar con el consentimiento de sus propios clientes</strong>{" "}
        para contactarlos por WhatsApp u otros medios (recordatorios de
        citas, confirmaciones de pedidos, promociones, etc.), así como de
        cumplir frente a ellos con la normatividad de protección de datos
        personales aplicable. Fuera Libreta únicamente provee la
        herramienta tecnológica para hacerlo.
      </p>

      <h2>7. Suspensión por abuso</h2>
      <p>
        Podemos suspender o cancelar, de forma temporal o definitiva, el
        acceso de cualquier cuenta que incumpla estos Términos, que haga un
        uso abusivo o fraudulento de la plataforma, o que ponga en riesgo la
        seguridad, disponibilidad o reputación del servicio para otros
        usuarios. Cuando sea razonablemente posible, notificaremos al
        negocio afectado el motivo de la suspensión.
      </p>

      <h2>8. Legislación aplicable y jurisdicción</h2>
      <p>
        Estos Términos se rigen por las leyes de los Estados Unidos
        Mexicanos. Para la interpretación y cumplimiento de los mismos, las
        partes se someten a la jurisdicción de los tribunales competentes de{" "}
        <strong>Tepic, Nayarit</strong>, renunciando expresamente a
        cualquier otro fuero que pudiera corresponderles por razón de su
        domicilio presente o futuro.
      </p>

      <h2>Contacto</h2>
      <p>
        Si tienes dudas sobre estos Términos, escríbenos a{" "}
        <a href="mailto:contacto@fueralibreta.com">contacto@fueralibreta.com</a>.
      </p>
    </article>
  );
}
