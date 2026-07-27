// Phase 2 Diagnostic Engine — POST advances a case's engine one turn
// (docs/PHASE_2_ARCHITECTURE.md, spec item 15: "API — versioned
// endpoints. Do not break Phase 1."). Versioned under /v1 as its own new
// namespace rather than reusing /api/scan-diagnostics — this is additive,
// not a replacement for the existing scan-report analyze route, which is
// untouched.
//
// Gated on PROBABILITY_ENGINE_ENABLED — every Phase 2 flag defaults to
// false (see feature-flags.ts), so this route 404s in any environment
// that hasn't explicitly turned the engine on, matching CLAUDE.md's
// "feature flags default off for anything not fully wired up."
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DIAGNOSTIC_ENGINE_FLAGS } from "@/lib/diagnostic-engine/feature-flags";
import { runDiagnosticEngineTurn } from "@/lib/diagnostic-engine/orchestrator";
import { AnthropicDiagnosticProvider } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;

  try {
    if (!DIAGNOSTIC_ENGINE_FLAGS.probabilityEngineEnabled()) {
      return NextResponse.json({ error: "The AI Diagnostic Engine is not available yet." }, { status: 404 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to use the diagnostic engine." }, { status: 401 });
    }

    const provider = new AnthropicDiagnosticProvider();
    const result = await runDiagnosticEngineTurn(user.id, caseId, provider);
    return NextResponse.json(result);
  } catch (err) {
    return toSafeErrorResponse(err, "diagnostic engine turn");
  }
}
