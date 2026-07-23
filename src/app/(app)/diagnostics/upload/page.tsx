import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { ScanCaseUploadForm } from "@/components/ScanCaseUploadForm";

export const metadata: Metadata = {
  title: "Upload a Scan Report",
  description: "Upload a diagnostic scan report to get a structured AI-assisted analysis.",
};

export default async function DiagnosticsUploadPage() {
  if (!env.scanDiagnosticsEnabled()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account/login");

  return (
    <div className="container-app px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Upload a Scan Report</h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Supported formats: PDF, TXT, CSV, JSON, XML, HTML from most common scan tools (Autel, Launch, Topdon,
          Techstream, GDS2, ISTA, ODIS, FORScan, generic OBD-II).
        </p>
        <div className="mt-8">
          <ScanCaseUploadForm />
        </div>
      </div>
    </div>
  );
}
