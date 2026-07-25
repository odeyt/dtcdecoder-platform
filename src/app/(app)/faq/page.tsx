import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
};

type Faq = {
  question: string;
  answer: React.ReactNode;
};

const faqsEn: Faq[] = [
  {
    question: "How accurate is the AI?",
    answer:
      "The AI provides professional-grade assistance but should always be verified with proper diagnostic testing.",
  },
  {
    question: "Does the AI replace a technician?",
    answer: "No. It assists technicians by analyzing DTCs, symptoms, and repair information.",
  },
  {
    question: "Which AI models are used?",
    answer:
      "DTCDecoder uses Anthropic's Claude models to power its AI diagnostic features. The AI capabilities available to you depend on your subscription plan.",
  },
  {
    question: "How do I cancel?",
    answer: (
      <>
        Log into your account and select <strong className="text-white">Billing</strong>, or use the
        customer billing portal provided by Creem. Cancellation stops future renewals.
      </>
    ),
  },
  {
    question: "Will I lose my reports?",
    answer:
      "Expired subscriptions may lose access to premium AI reports while retaining basic account information.",
  },
  {
    question: "Are payments secure?",
    answer:
      "Yes. Payments are securely processed through Creem.io. We never store your full payment card details.",
  },
  {
    question: "Do you offer refunds?",
    answer: (
      <>
        Please see our{" "}
        <Link href="/refund" className="text-[var(--accent-red)] underline">
          Refund Policy
        </Link>
        .
      </>
    ),
  },
  {
    question: "Is my vehicle data private?",
    answer:
      "Yes. We do not sell your personal data. Diagnostic information is used only to provide and improve our Services.",
  },
  {
    question: "Can I upload scanner files?",
    answer: "Yes. Supported subscriptions can upload scan reports for AI-assisted analysis.",
  },
  {
    question: "Which vehicles are supported?",
    answer:
      "Most OBD-II compliant vehicles along with many manufacturer-specific systems. Coverage continues to expand.",
  },
  {
    question: "Can I use DTCDecoder commercially?",
    answer:
      "Yes. Professional repair shops may use DTCDecoder according to their subscription plan. Enterprise licensing is available.",
  },
  {
    question: "How can I contact support?",
    answer: (
      <>
        Email:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </>
    ),
  },
];

const faqsEs: Faq[] = [
  {
    question: "¿Qué tan precisa es la IA?",
    answer:
      "La IA ofrece asistencia de nivel profesional, pero siempre debe verificarse con pruebas de diagnóstico adecuadas.",
  },
  {
    question: "¿La IA reemplaza a un técnico?",
    answer:
      "No. Asiste a los técnicos analizando códigos DTC, síntomas e información de reparación.",
  },
  {
    question: "¿Qué modelos de IA se utilizan?",
    answer:
      "DTCDecoder utiliza los modelos Claude de Anthropic para sus funciones de diagnóstico con IA. Las capacidades de IA disponibles dependen de tu plan de suscripción.",
  },
  {
    question: "¿Cómo cancelo?",
    answer: (
      <>
        Inicia sesión en tu cuenta y selecciona <strong className="text-white">Facturación</strong>, o
        usa el portal de facturación para clientes proporcionado por Creem. La cancelación detiene las
        renovaciones futuras.
      </>
    ),
  },
  {
    question: "¿Perderé mis reportes?",
    answer:
      "Las suscripciones vencidas pueden perder el acceso a los reportes premium de IA, aunque conservan la información básica de la cuenta.",
  },
  {
    question: "¿Los pagos son seguros?",
    answer:
      "Sí. Los pagos se procesan de forma segura a través de Creem.io. Nunca almacenamos los datos completos de tu tarjeta.",
  },
  {
    question: "¿Ofrecen reembolsos?",
    answer: (
      <>
        Consulta nuestra{" "}
        <Link href="/refund" className="text-[var(--accent-red)] underline">
          Política de Reembolsos
        </Link>
        .
      </>
    ),
  },
  {
    question: "¿Mis datos del vehículo son privados?",
    answer:
      "Sí. No vendemos tus datos personales. La información de diagnóstico se usa únicamente para prestar y mejorar nuestros Servicios.",
  },
  {
    question: "¿Puedo subir archivos del escáner?",
    answer:
      "Sí. Las suscripciones compatibles pueden subir reportes de escaneo para análisis asistido por IA.",
  },
  {
    question: "¿Qué vehículos son compatibles?",
    answer:
      "La mayoría de los vehículos compatibles con OBD-II, junto con muchos sistemas específicos de cada fabricante. La cobertura sigue ampliándose.",
  },
  {
    question: "¿Puedo usar DTCDecoder comercialmente?",
    answer:
      "Sí. Los talleres profesionales pueden usar DTCDecoder según su plan de suscripción. Hay licencias empresariales disponibles.",
  },
  {
    question: "¿Cómo contacto con soporte?",
    answer: (
      <>
        Correo:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </>
    ),
  },
];

export default async function FaqPage() {
  const locale = await getLocale();
  const isEs = locale === "es";
  const faqs = isEs ? faqsEs : faqsEn;

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">
        {isEs ? "Preguntas Frecuentes" : "Frequently Asked Questions"}
      </h1>

      <div className="mt-10 space-y-10">
        {faqs.map((faq) => (
          <div key={faq.question}>
            <h2 className="text-xl font-bold text-white">{faq.question}</h2>
            <p className="mt-4">{faq.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
