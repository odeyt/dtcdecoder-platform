import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runRetentionSweep } from "@/lib/scan-diagnostics/retention";

// Vercel Cron (see vercel.json) sends Authorization: Bearer <CRON_SECRET>
// automatically when CRON_SECRET is set in the project's env vars — any
// request without the matching secret is rejected, since this route
// deletes customer data.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.cronSecret()}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = env.retentionSweepDryRun();

  try {
    const result = await runRetentionSweep({ dryRun });
    console.log(
      `[retention-sweep] dryRun=${dryRun} candidates=${result.candidateCaseIds.length} deleted=${result.deletedCaseIds.length}`,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[retention-sweep] failed", err);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
