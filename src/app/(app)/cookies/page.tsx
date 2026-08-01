import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "Cookie Policy",
};

function CookiesEn() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>DTCDecoder Cookie Policy</h1>
      <p className="text-sm text-[var(--text-muted)]">Effective Date: July 25, 2026</p>

      <p>
        This Cookie Policy explains how DTCDecoder uses cookies and similar technologies when you
        use our website and services.
      </p>

      <h2>What Are Cookies</h2>
      <p>
        Cookies are small text files stored on your device that help websites function and remember
        information about your visit.
      </p>

      <h2>Types of Cookies We Use</h2>
      <ul>
        <li>
          <strong>Essential</strong> — required for authentication, secure
          sign-in, and core site functionality. These cannot be disabled.
        </li>
        <li>
          <strong>Preferences</strong> — remember choices such as language
          and display settings.
        </li>
        <li>
          <strong>Analytics</strong> — help us understand how the platform is
          used so we can improve performance.
        </li>
        <li>
          <strong>Security</strong> — help detect and prevent fraud and
          abuse.
        </li>
      </ul>

      <h2>Third-Party Cookies</h2>
      <p>
        Some cookies may be set by trusted third parties that support our Services, such as our
        payment processor Creem.io and infrastructure providers. These parties process data
        according to their own privacy policies.
      </p>

      <h2>Managing Cookies</h2>
      <p>
        You can control or delete cookies through your browser settings. Disabling essential cookies
        may prevent parts of the platform from working correctly, including sign-in.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this Cookie Policy from time to time. Continued use of the Services
        constitutes acceptance of the revised policy.
      </p>

      <h2>Contact</h2>
      <p>
        Email:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}

function CookiesEs() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>Política de Cookies de DTCDecoder</h1>
      <p className="text-sm text-[var(--text-muted)]">Fecha de vigencia: 25 de julio de 2026</p>

      <p>
        Esta Política de Cookies explica cómo DTCDecoder utiliza cookies y tecnologías similares
        cuando usas nuestro sitio web y servicios.
      </p>

      <h2>Qué Son las Cookies</h2>
      <p>
        Las cookies son pequeños archivos de texto almacenados en tu dispositivo que ayudan a que los
        sitios web funcionen y recuerden información sobre tu visita.
      </p>

      <h2>Tipos de Cookies Que Usamos</h2>
      <ul>
        <li>
          <strong>Esenciales</strong> — necesarias para la autenticación, el
          inicio de sesión seguro y las funciones básicas del sitio. No se pueden desactivar.
        </li>
        <li>
          <strong>Preferencias</strong> — recuerdan opciones como el idioma y
          la configuración de visualización.
        </li>
        <li>
          <strong>Analíticas</strong> — nos ayudan a entender cómo se usa la
          plataforma para mejorar el rendimiento.
        </li>
        <li>
          <strong>Seguridad</strong> — ayudan a detectar y prevenir fraudes y
          abusos.
        </li>
      </ul>

      <h2>Cookies de Terceros</h2>
      <p>
        Algunas cookies pueden ser establecidas por terceros de confianza que dan soporte a nuestros
        Servicios, como nuestro procesador de pagos Creem.io y proveedores de infraestructura. Estas
        partes procesan los datos conforme a sus propias políticas de privacidad.
      </p>

      <h2>Gestión de Cookies</h2>
      <p>
        Puedes controlar o eliminar las cookies desde la configuración de tu navegador. Desactivar
        las cookies esenciales puede impedir que partes de la plataforma funcionen correctamente,
        incluido el inicio de sesión.
      </p>

      <h2>Cambios</h2>
      <p>
        Podemos actualizar esta Política de Cookies ocasionalmente. El uso continuado de los
        Servicios constituye la aceptación de la política revisada.
      </p>

      <h2>Contacto</h2>
      <p>
        Correo:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}

export default async function CookiePolicyPage() {
  const locale = await getLocale();
  return locale === "es" ? <CookiesEs /> : <CookiesEn />;
}
