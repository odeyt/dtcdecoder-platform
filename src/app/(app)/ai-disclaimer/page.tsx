import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "AI Disclaimer",
};

function AiDisclaimerEn() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">AI Disclaimer</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        DTCDecoder uses artificial intelligence to assist with automotive diagnostics. This
        disclaimer explains the limits of that assistance.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Assistance, Not Professional Advice</h2>
      <p className="mt-4">
        AI-generated diagnostic suggestions are informational aids intended to support technicians
        and vehicle owners. They are not a substitute for professional inspection, manufacturer
        service procedures, or the judgment of a qualified technician.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Verification Required</h2>
      <p className="mt-4">
        AI output may contain inaccuracies or incomplete information. All recommendations, test
        values, and procedures should be verified using proper diagnostic testing and official
        service information before acting on them.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">No Guarantee of Results</h2>
      <p className="mt-4">
        We do not guarantee that any AI recommendation will identify or resolve a particular vehicle
        problem. Confidence indicators, likely causes, and suggested tests are estimates, not
        certainties.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Safety</h2>
      <p className="mt-4">
        Automotive repair can involve risk of injury or vehicle damage. Do not attempt any procedure
        you are not qualified to perform safely. Always follow proper safety precautions and
        manufacturer guidance.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">User Responsibility</h2>
      <p className="mt-4">
        You assume full responsibility for any repair, parts-replacement, or diagnostic decision
        made based on information from the platform.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">AI Providers</h2>
      <p className="mt-4">
        Diagnostic information you submit may be processed by our AI provider (Anthropic) to generate
        recommendations. See our{" "}
        <a href="/privacy" className="text-[var(--accent-red)] underline">
          Privacy Policy
        </a>{" "}
        for details on data handling.
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

function AiDisclaimerEs() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Descargo de Responsabilidad de IA</h1>
      <p className="mt-2 text-sm text-zinc-500">Fecha de vigencia: 25 de julio de 2026</p>

      <p className="mt-6">
        DTCDecoder utiliza inteligencia artificial para asistir en el diagnóstico automotriz. Este
        descargo de responsabilidad explica los límites de esa asistencia.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Asistencia, No Asesoramiento Profesional</h2>
      <p className="mt-4">
        Las sugerencias de diagnóstico generadas por IA son ayudas informativas destinadas a apoyar a
        técnicos y propietarios de vehículos. No sustituyen la inspección profesional, los
        procedimientos de servicio del fabricante ni el criterio de un técnico calificado.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Se Requiere Verificación</h2>
      <p className="mt-4">
        Los resultados de la IA pueden contener imprecisiones o información incompleta. Todas las
        recomendaciones, valores de prueba y procedimientos deben verificarse mediante pruebas de
        diagnóstico adecuadas e información de servicio oficial antes de actuar en consecuencia.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Sin Garantía de Resultados</h2>
      <p className="mt-4">
        No garantizamos que ninguna recomendación de IA identifique o resuelva un problema concreto
        del vehículo. Los indicadores de confianza, las causas probables y las pruebas sugeridas son
        estimaciones, no certezas.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Seguridad</h2>
      <p className="mt-4">
        La reparación automotriz puede implicar riesgo de lesiones o daños al vehículo. No intentes
        ningún procedimiento que no estés calificado para realizar de forma segura. Sigue siempre las
        precauciones de seguridad adecuadas y las indicaciones del fabricante.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Responsabilidad del Usuario</h2>
      <p className="mt-4">
        Asumes toda la responsabilidad por cualquier decisión de reparación, reemplazo de piezas o
        diagnóstico tomada con base en la información de la plataforma.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Proveedores de IA</h2>
      <p className="mt-4">
        La información de diagnóstico que envíes puede ser procesada por nuestro proveedor de IA
        (Anthropic) para generar recomendaciones. Consulta nuestra{" "}
        <a href="/privacy" className="text-[var(--accent-red)] underline">
          Política de Privacidad
        </a>{" "}
        para conocer los detalles sobre el manejo de datos.
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

export default async function AiDisclaimerPage() {
  const locale = await getLocale();
  return locale === "es" ? <AiDisclaimerEs /> : <AiDisclaimerEn />;
}
