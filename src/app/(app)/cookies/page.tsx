import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "Cookie Policy",
};

function CookiesEn() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">DTCDecoder Cookie Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        This Cookie Policy explains how DTCDecoder uses cookies and similar technologies when you
        use our website and services.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">What Are Cookies</h2>
      <p className="mt-4">
        Cookies are small text files stored on your device that help websites function and remember
        information about your visit.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Types of Cookies We Use</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-white">Essential</strong> — required for authentication, secure
          sign-in, and core site functionality. These cannot be disabled.
        </li>
        <li>
          <strong className="text-white">Preferences</strong> — remember choices such as language
          and display settings.
        </li>
        <li>
          <strong className="text-white">Analytics</strong> — help us understand how the platform is
          used so we can improve performance.
        </li>
        <li>
          <strong className="text-white">Security</strong> — help detect and prevent fraud and
          abuse.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Third-Party Cookies</h2>
      <p className="mt-4">
        Some cookies may be set by trusted third parties that support our Services, such as our
        payment processor Creem.io and infrastructure providers. These parties process data
        according to their own privacy policies.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Managing Cookies</h2>
      <p className="mt-4">
        You can control or delete cookies through your browser settings. Disabling essential cookies
        may prevent parts of the platform from working correctly, including sign-in.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Changes</h2>
      <p className="mt-4">
        We may update this Cookie Policy from time to time. Continued use of the Services
        constitutes acceptance of the revised policy.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Contact</h2>
      <p className="mt-4">
        Email:{" "}
        <a href="mailto:support@redlined1.com" className="text-[var(--accent-red)] underline">
          support@redlined1.com
        </a>
      </p>
    </div>
  );
}

function CookiesEs() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Política de Cookies de DTCDecoder</h1>
      <p className="mt-2 text-sm text-zinc-500">Fecha de vigencia: 25 de julio de 2026</p>

      <p className="mt-6">
        Esta Política de Cookies explica cómo DTCDecoder utiliza cookies y tecnologías similares
        cuando usas nuestro sitio web y servicios.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Qué Son las Cookies</h2>
      <p className="mt-4">
        Las cookies son pequeños archivos de texto almacenados en tu dispositivo que ayudan a que los
        sitios web funcionen y recuerden información sobre tu visita.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Tipos de Cookies Que Usamos</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-white">Esenciales</strong> — necesarias para la autenticación, el
          inicio de sesión seguro y las funciones básicas del sitio. No se pueden desactivar.
        </li>
        <li>
          <strong className="text-white">Preferencias</strong> — recuerdan opciones como el idioma y
          la configuración de visualización.
        </li>
        <li>
          <strong className="text-white">Analíticas</strong> — nos ayudan a entender cómo se usa la
          plataforma para mejorar el rendimiento.
        </li>
        <li>
          <strong className="text-white">Seguridad</strong> — ayudan a detectar y prevenir fraudes y
          abusos.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Cookies de Terceros</h2>
      <p className="mt-4">
        Algunas cookies pueden ser establecidas por terceros de confianza que dan soporte a nuestros
        Servicios, como nuestro procesador de pagos Creem.io y proveedores de infraestructura. Estas
        partes procesan los datos conforme a sus propias políticas de privacidad.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Gestión de Cookies</h2>
      <p className="mt-4">
        Puedes controlar o eliminar las cookies desde la configuración de tu navegador. Desactivar
        las cookies esenciales puede impedir que partes de la plataforma funcionen correctamente,
        incluido el inicio de sesión.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Cambios</h2>
      <p className="mt-4">
        Podemos actualizar esta Política de Cookies ocasionalmente. El uso continuado de los
        Servicios constituye la aceptación de la política revisada.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Contacto</h2>
      <p className="mt-4">
        Correo:{" "}
        <a href="mailto:support@redlined1.com" className="text-[var(--accent-red)] underline">
          support@redlined1.com
        </a>
      </p>
    </div>
  );
}

export default async function CookiePolicyPage() {
  const locale = await getLocale();
  return locale === "es" ? <CookiesEs /> : <CookiesEn />;
}
