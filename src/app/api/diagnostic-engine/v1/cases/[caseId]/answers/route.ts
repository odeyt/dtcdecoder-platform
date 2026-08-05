// Phase 2 Diagnostic Engine — POST records a technician's answer to the
// current Question Engine question (docs/QUESTION_ENGINE.md). Marks the
// question answered and records the answer as a new EvidenceItem
// (evidenceFromAnswer) so the NEXT /turn call reasons over it — this route
// never calls the AI provider itself, only persists structured facts.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import { DIAGNOSTIC_ENGINE_FLAGS } from "@/lib/diagnostic-engine/feature-flags";
import { recordAnswer } from "@/lib/diagnostic-engine/question";
import { insertEvidence, evidenceFromAnswer } from "@/lib/diagnostic-engine/evidence";
import { toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

const AnswerBodySchema = z.object({
  questionId: z.string().uuid(),
  fieldKey: z.string().min(1),
  answerText: z.string().min(1),
  answerValue: z.unknown().optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;

  try {
    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

    if (!DIAGNOSTIC_ENGINE_FLAGS.questionEngineEnabled()) {
      return NextResponse.json({ error: t.diagnosticEngineNotAvailable }, { status: 404 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: t.signInToAnswerQuestions }, { status: 401 });
    }

    await getCaseForOwner(user.id, caseId);

    const parsed = AnswerBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: t.invalidAnswerPayload }, { status: 400 });
    }
    const { questionId, fieldKey, answerText, answerValue } = parsed.data;

    const answer = await recordAnswer(questionId, caseId, answerText, answerValue);
    const [evidenceItem] = await insertEvidence(caseId, [evidenceFromAnswer(fieldKey, answerText, answerValue)]);

    return NextResponse.json({ answer, evidenceItem });
  } catch (err) {
    return toSafeErrorResponse(err, "diagnostic engine answer");
  }
}
