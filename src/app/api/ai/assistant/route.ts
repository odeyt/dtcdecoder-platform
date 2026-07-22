import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { findGroundingDtcCodes } from "@/lib/ai/grounding";
import {
  enforceRateLimit,
  streamAssistantResponse,
  RateLimitExceededError,
} from "@/lib/ai/assistant";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use the AI diagnostic assistant" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const plan = await getEffectivePlan(user.id, user.email ?? null);

  try {
    await enforceRateLimit(user.id, plan);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json(
        {
          error:
            "You've hit today's Free plan AI query limit. Upgrade to Pro for unlimited diagnostic help.",
        },
        { status: 429 },
      );
    }
    throw err;
  }

  const groundingRows = await findGroundingDtcCodes(parsed.data.message);
  const claudeStream = await streamAssistantResponse(parsed.data.message, groundingRows);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        console.error("AI assistant stream failed", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
