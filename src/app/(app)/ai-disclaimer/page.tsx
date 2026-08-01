import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "AI Disclaimer",
};

function AiDisclaimerEn() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>AI Disclaimer</h1>
      <p className="text-sm text-[var(--text-muted)]">Effective Date: July 25, 2026</p>

      <p>
        DTCDecoder uses artificial intelligence to assist with automotive diagnostics. This
        disclaimer explains the limits of that assistance.
      </p>

      <h2>Assistance, Not Professional Advice</h2>
      <p>
        AI-generated diagnostic suggestions are informational aids intended to support technicians
        and vehicle owners. They are not a substitute for professional inspection, manufacturer
        service procedures, or the judgment of a qualified technician.
      </p>

      <h2>Verification Required</h2>
      <p>
        AI output may contain inaccuracies or incomplete information. All recommendations, test
        values, and procedures should be verified using proper diagnostic testing and official
        service information before acting on them.
      </p>

      <h2>No Guarantee of Results</h2>
      <p>
        We do not guarantee that any AI recommendation will identify or resolve a particular vehicle
        problem. Confidence indicators, likely causes, and suggested tests are estimates, not
        certainties.
      </p>

      <h2>Safety</h2>
      <p>
        Automotive repair can involve risk of injury or vehicle damage. Do not attempt any procedure
        you are not qualified to perform safely. Always follow proper safety precautions and
        manufacturer guidance.
      </p>

      <h2>User Responsibility</h2>
      <p>
        You assume full responsibility for any repair, parts-replacement, or diagnostic decision
        made based on information from the platform.
      </p>

      <h2>AI Providers</h2>
      <p>
        Diagnostic information you submit may be processed by our AI provider (Anthropic) to generate
        recommendations. See our{" "}
        <Link href="/privacy" className="text-[var(--accent-red)] underline">
          Privacy Policy
        </Link>{" "}
        for details on data handling.
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

function AiDisclaimerEs() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>Descargo de Responsabilidad de IA</h1>
      <p className="text-sm text-[var(--text-muted)]">Fecha de vigencia: 25 de julio de 2026</p>

      <p>
        DTCDecoder utiliza inteligencia artificial para asistir en el diagnóstico automotriz. Este
        descargo de responsabilidad explica los límites de esa asistencia.
      </p>

      <h2>Asistencia, No Asesoramiento Profesional</h2>
      <p>
        Las sugerencias de diagnóstico generadas por IA son ayudas informativas destinadas a apoyar a
        técnicos y propietarios de vehículos. No sustituyen la inspección profesional, los
        procedimientos de servicio del fabricante ni el criterio de un técnico calificado.
      </p>

      <h2>Se Requiere Verificación</h2>
      <p>
        Los resultados de la IA pueden contener imprecisiones o información incompleta. Todas las
        recomendaciones, valores de prueba y procedimientos deben verificarse mediante pruebas de
        diagnóstico adecuadas e información de servicio oficial antes de actuar en consecuencia.
      </p>

      <h2>Sin Garantía de Resultados</h2>
      <p>
        No garantizamos que ninguna recomendación de IA identifique o resuelva un problema concreto
        del vehículo. Los indicadores de confianza, las causas probables y las pruebas sugeridas son
        estimaciones, no certezas.
      </p>

      <h2>Seguridad</h2>
      <p>
        La reparación automotriz puede implicar riesgo de lesiones o daños al vehículo. No intentes
        ningún procedimiento que no estés calificado para realizar de forma segura. Sigue siempre las
        precauciones de seguridad adecuadas y las indicaciones del fabricante.
      </p>

      <h2>Responsabilidad del Usuario</h2>
      <p>
        Asumes toda la responsabilidad por cualquier decisión de reparación, reemplazo de piezas o
        diagnóstico tomada con base en la información de la plataforma.
      </p>

      <h2>Proveedores de IA</h2>
      <p>
        La información de diagnóstico que envíes puede ser procesada por nuestro proveedor de IA
        (Anthropic) para generar recomendaciones. Consulta nuestra{" "}
        <Link href="/privacy" className="text-[var(--accent-red)] underline">
          Política de Privacidad
        </Link>{" "}
        para conocer los detalles sobre el manejo de datos.
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

export default async function AiDisclaimerPage() {
  const locale = await getLocale();
  return locale === "es" ? <AiDisclaimerEs /> : <AiDisclaimerEn />;
}
