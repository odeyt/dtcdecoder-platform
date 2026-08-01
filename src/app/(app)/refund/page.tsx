import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "Refund Policy",
};

function RefundEn() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>DTCDecoder Refund Policy</h1>
      <p className="text-sm text-[var(--text-muted)]">Effective Date: July 25, 2026</p>

      <p>Payments are processed by Creem.io.</p>

      <h2>Monthly Subscriptions</h2>
      <ul>
        <li>You may cancel your subscription at any time.</li>
        <li>Cancellation prevents future renewals.</li>
        <li>
          Previously paid subscription fees are generally non-refundable except where required by
          law.
        </li>
      </ul>

      <h2>Annual Plans</h2>
      <p>Annual subscriptions may be eligible for refunds only if:</p>
      <ul>
        <li>Requested within 14 days of purchase</li>
        <li>Minimal platform usage occurred</li>
        <li>Required by applicable law</li>
      </ul>

      <h2>Digital Products</h2>
      <p>
        Downloaded digital products, repair guides, and reports are generally non-refundable.
      </p>

      <h2>Duplicate Charges</h2>
      <p>Duplicate or accidental charges will be refunded after verification.</p>

      <h2>Fraud</h2>
      <p>
        Fraudulent transactions will be investigated and handled according to applicable laws.
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

function RefundEs() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>Política de Reembolsos de DTCDecoder</h1>
      <p className="text-sm text-[var(--text-muted)]">Fecha de vigencia: 25 de julio de 2026</p>

      <p>Los pagos son procesados por Creem.io.</p>

      <h2>Suscripciones Mensuales</h2>
      <ul>
        <li>Puedes cancelar tu suscripción en cualquier momento.</li>
        <li>La cancelación evita renovaciones futuras.</li>
        <li>
          Las cuotas de suscripción ya pagadas generalmente no son reembolsables, salvo cuando la ley
          lo exija.
        </li>
      </ul>

      <h2>Planes Anuales</h2>
      <p>
        Las suscripciones anuales pueden ser elegibles para un reembolso solo si:
      </p>
      <ul>
        <li>Se solicita dentro de los 14 días posteriores a la compra</li>
        <li>Hubo un uso mínimo de la plataforma</li>
        <li>Lo exige la ley aplicable</li>
      </ul>

      <h2>Productos Digitales</h2>
      <p>
        Los productos digitales descargados, las guías de reparación y los reportes generalmente no
        son reembolsables.
      </p>

      <h2>Cargos Duplicados</h2>
      <p>
        Los cargos duplicados o accidentales se reembolsarán tras su verificación.
      </p>

      <h2>Fraude</h2>
      <p>
        Las transacciones fraudulentas se investigarán y gestionarán conforme a las leyes aplicables.
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

export default async function RefundPolicyPage() {
  const locale = await getLocale();
  return locale === "es" ? <RefundEs /> : <RefundEn />;
}
