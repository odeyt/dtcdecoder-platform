// Seeds a fully "completed", full-access diagnostic case directly via the
// Supabase admin client — no real Anthropic call, matching this repo's own
// deterministic-suite convention (see the `production-internal` workflow
// job's own comment about being the only place real AI budget is spent).
// This is the one thing tests/e2e/fixtures/diagnostic-cases.ts doesn't
// cover: that fixture drives the (separate) Diagnostic Engine, not the
// scan-diagnostics Workbench redesign's 11-section report page, which only
// ever renders once a real `scan_reports` row exists for a "completed"
// case. Every column below mirrors what runScanAnalysis
// (src/lib/scan-diagnostics/analyze.ts) would have persisted for a real
// AI run — same shapes, same tables, just skipping the actual model call.
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface SeededWorkbenchCase {
  caseId: string;
}

// `single_report_purchases` (not a paid plan) is what grants "full" access
// here — see resolveReportAccess in src/lib/scan-diagnostics/report-access.ts.
// Simpler than faking a subscription for a throwaway synthetic user, and
// exercises the exact same access path a real one-time-report buyer takes.
export async function seedCompletedWorkbenchCase(userId: string): Promise<SeededWorkbenchCase> {
  const admin = adminClient();
  if (!admin) throw new Error("Supabase admin credentials not configured — see docs/PLAYWRIGHT_AUTH_SETUP.md.");

  const { data: scanCase, error: caseError } = await admin
    .from("scan_cases")
    .insert({
      user_id: userId,
      status: "completed",
      complaint: "Check engine light on, intermittent rough idle",
      symptoms: ["Check engine light illuminated", "Occasional rough idle at start-up"],
      mileage: 62000,
      battery_condition: "Tested normal, 12.6V at rest",
      technician_notes: "Customer reports symptom worsens on cold mornings.",
      report_language: "en",
    })
    .select("id")
    .single();
  if (caseError) throw caseError;
  const caseId = scanCase.id as string;

  const { error: extractionError } = await admin.from("scan_extractions").insert({
    case_id: caseId,
    file_id: null,
    parser_id: "e2e-fixture",
    parser_version: "1",
    vin: "1FTFW1ET1EFA00099",
    make: "Ford",
    model: "F-150",
    model_year: 2019,
    engine: "5.0L V8",
    odometer_miles: 62000,
    modules: [],
    freeze_frame: [],
    live_data: [],
    image_only_pdf: false,
    warnings: [],
    reviewed_fields: {},
    reviewed_at: new Date().toISOString(),
  });
  if (extractionError) throw extractionError;

  const { error: dtcError } = await admin.from("scan_dtc_records").insert([
    { case_id: caseId, module: "ECM", code: "P0420", status: "current", description_raw: "Catalyst System Efficiency Below Threshold (Bank 1)", source: "extracted" },
    { case_id: caseId, module: "ECM", code: "P0171", status: "current", description_raw: "System Too Lean (Bank 1)", source: "extracted" },
  ]);
  if (dtcError) throw dtcError;

  const { error: systemError } = await admin.from("scan_systems").insert({
    case_id: caseId,
    system_name: "Powertrain",
    module_name: "ECM",
    status: "faulted",
    dtc_count_reported: 2,
    dtc_count_extracted: 2,
    extraction_complete: true,
  });
  if (systemError) throw systemError;

  const { error: patternError } = await admin.from("scan_patterns").insert({
    case_id: caseId,
    pattern_type: "related_codes",
    severity: "warn",
    evidence: { note: "Seeded for Workbench redesign e2e verification — not a real detection." },
    affected_modules: ["ECM"],
    rule_version: "e2e-fixture-v1",
  });
  if (patternError) throw patternError;

  const { data: aiRun, error: aiRunError } = await admin
    .from("scan_ai_runs")
    .insert({
      case_id: caseId,
      provider_id: "e2e-fixture",
      model_id: "e2e-fixture",
      status: "completed",
      output: {},
      safety_review: { findings: [] },
      confidence: 0.8,
      confidence_breakdown: { confidenceLevel: "high" },
      input_tokens: 0,
      output_tokens: 0,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (aiRunError) throw aiRunError;

  const { error: reportError } = await admin.from("scan_reports").insert({
    case_id: caseId,
    ai_run_id: aiRun.id as string,
    ranked_causes: [
      {
        cause: "Catalytic converter degradation (Bank 1)",
        confidenceLevel: "high",
        rationale:
          "P0420 alongside a sustained lean condition on the same bank (P0171) is consistent with a degraded catalyst losing oxygen storage capacity.",
        supportingEvidence: ["P0420 stored, current", "P0171 stored, current, same bank"],
        contradictingEvidence: [],
        confirmationTestsRequired: [
          "Post-catalyst O2 sensor switching-rate test",
          "Visual inspection for exhaust leaks upstream of the catalyst",
        ],
      },
    ],
    recommended_tests: [
      {
        step: "Test upstream and downstream O2 sensor switching rates",
        purpose: "Confirm catalyst efficiency has actually degraded rather than a sensor fault",
        expectedResult: "Downstream sensor switching frequency approaches upstream rate if the catalyst is worn",
      },
      {
        step: "Inspect for exhaust leaks upstream of the catalyst",
        purpose: "Rule out a lean condition caused by an intake or exhaust leak rather than the catalyst itself",
        expectedResult: "No leaks found upstream of the catalytic converter",
      },
    ],
    safety_warnings: [],
    missing_information: ["Fuel trim data at idle and cruise was not included in the uploaded scan"],
    confidence: 0.8,
    confidence_level: "high",
    confidence_rationale: [
      "Two related, currently-active DTCs point to a single root cause",
      "No conflicting evidence was found in the uploaded scan",
    ],
    schema_version: "2.0",
    generated_at: new Date().toISOString(),
  });
  if (reportError) throw reportError;

  // Grants full access without needing a paid subscription plan — see the
  // module comment above.
  const { error: purchaseError } = await admin.from("single_report_purchases").insert({
    user_id: userId,
    status: "consumed",
    case_id: caseId,
    creem_order_id: `e2e-workbench-${caseId}`,
    purchased_at: new Date().toISOString(),
    consumed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (purchaseError) throw purchaseError;

  return { caseId };
}

// Deletes the purchase row explicitly before the case itself: a "consumed"
// row's case_id -> scan_cases FK is ON DELETE SET NULL (migration 0037), but
// its own check constraint requires case_id to stay non-null while
// status='consumed' — deleting the case first would violate that
// constraint and fail. cleanupSyntheticUsers (database-cleanup.ts) deletes
// scan_cases (cascading to extractions/dtc records/systems/patterns/ai
// runs/reports) as its own separate step, so this only needs to handle the
// one row that isn't reached by that cascade.
export async function cleanupWorkbenchCase(caseId: string): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  await admin.from("single_report_purchases").delete().eq("case_id", caseId);
}
