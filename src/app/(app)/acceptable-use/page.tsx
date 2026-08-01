import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
};

function AcceptableUseEn() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>Acceptable Use Policy</h1>
      <p className="text-sm text-[var(--text-muted)]">Effective Date: July 25, 2026</p>

      <p>
        This Acceptable Use Policy governs your use of DTCDecoder. By using the Services, you agree
        not to misuse the platform or help anyone else do so.
      </p>

      <h2>Prohibited Activities</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Reverse engineer, decompile, or attempt to extract our source code or AI prompts</li>
        <li>Scrape, harvest, or bulk-download our database or content</li>
        <li>Abuse, circumvent, or exceed API or usage limits</li>
        <li>Share, resell, or sublicense paid accounts or access credentials</li>
        <li>Resell or redistribute our content without written permission</li>
        <li>Upload malware or attempt to compromise platform security</li>
        <li>Interfere with or disrupt the integrity or performance of the Services</li>
        <li>Use the platform for any unlawful, fraudulent, or harmful purpose</li>
        <li>Impersonate others or misrepresent your affiliation with any person or entity</li>
      </ul>

      <h2>Account Responsibility</h2>
      <p>
        You are responsible for all activity under your account and for keeping your access secure.
        Paid plans are licensed for the number of users specified in your plan.
      </p>

      <h2>Automated Access</h2>
      <p>
        Automated access to the Services is permitted only through interfaces we expressly provide
        and within any documented limits.
      </p>

      <h2>Enforcement</h2>
      <p>
        Violations may result in warnings, suspension, or termination of access, and where
        appropriate, referral to law enforcement.
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

function AcceptableUseEs() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>Política de Uso Aceptable</h1>
      <p className="text-sm text-[var(--text-muted)]">Fecha de vigencia: 25 de julio de 2026</p>

      <p>
        Esta Política de Uso Aceptable regula tu uso de DTCDecoder. Al usar los Servicios, aceptas no
        hacer un uso indebido de la plataforma ni ayudar a otros a hacerlo.
      </p>

      <h2>Actividades Prohibidas</h2>
      <p>Aceptas no:</p>
      <ul>
        <li>Aplicar ingeniería inversa, descompilar o intentar extraer nuestro código fuente o instrucciones de IA</li>
        <li>Extraer, recopilar o descargar de forma masiva nuestra base de datos o contenido</li>
        <li>Abusar, eludir o exceder los límites de la API o de uso</li>
        <li>Compartir, revender o sublicenciar cuentas pagadas o credenciales de acceso</li>
        <li>Revender o redistribuir nuestro contenido sin permiso por escrito</li>
        <li>Subir software malicioso o intentar comprometer la seguridad de la plataforma</li>
        <li>Interferir o perturbar la integridad o el rendimiento de los Servicios</li>
        <li>Usar la plataforma para cualquier fin ilícito, fraudulento o dañino</li>
        <li>Suplantar a otros o tergiversar tu afiliación con cualquier persona o entidad</li>
      </ul>

      <h2>Responsabilidad de la Cuenta</h2>
      <p>
        Eres responsable de toda la actividad realizada en tu cuenta y de mantener tu acceso seguro.
        Los planes pagados se licencian para el número de usuarios especificado en tu plan.
      </p>

      <h2>Acceso Automatizado</h2>
      <p>
        El acceso automatizado a los Servicios solo se permite a través de las interfaces que
        proporcionamos expresamente y dentro de los límites documentados.
      </p>

      <h2>Cumplimiento</h2>
      <p>
        Las infracciones pueden dar lugar a advertencias, suspensión o terminación del acceso y,
        cuando corresponda, a la remisión a las autoridades.
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

export default async function AcceptableUsePage() {
  const locale = await getLocale();
  return locale === "es" ? <AcceptableUseEs /> : <AcceptableUseEn />;
}
