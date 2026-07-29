// Explicit, run-scoped teardown (Phase 20) — deletes every synthetic record
// created under the current E2E_RUN_ID. Individual tests should already
// clean up their own records in a `finally` block (see
// tests/e2e/helpers/database-cleanup.ts); this is the backstop that runs
// once at the end of a full suite invocation to catch anything a failed
// test didn't reach its own cleanup for.
//
// Run explicitly after a suite:
//   npx playwright test tests/e2e/setup/cleanup.setup.ts --project=chromium
//
// Silently no-ops (not a failure) when Supabase admin credentials aren't
// configured in this environment.
import { test as teardown } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { e2eRunId } from "../helpers/synthetic-data";

teardown("clean up synthetic records for this run", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  teardown.skip(!url || !key, "Supabase admin credentials not configured — skipping cleanup teardown.");
  if (!url || !key) return;

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = e2eRunId();

  // Synthetic users are emailed as `<label>-<runId>@dtcdecoder-e2e-test.invalid`
  // — list and filter rather than a broad delete, matching the "no broad
  // delete statements" rule.
  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const runUsers = (usersPage?.users ?? []).filter((u) => u.email?.includes(`-${runId}@dtcdecoder-e2e-test.invalid`));

  let casesDeleted = 0;
  for (const user of runUsers) {
    const { data: cases } = await admin.from("scan_cases").select("id").eq("user_id", user.id);
    const caseIds = (cases ?? []).map((c) => c.id);
    if (caseIds.length > 0) {
      await admin.from("scan_cases").delete().in("id", caseIds);
      casesDeleted += caseIds.length;
    }
    await admin.from("diagnostic_engine_usage").delete().eq("user_id", user.id);
    await admin.from("diagnostic_engine_runs").delete().eq("user_id", user.id);
    await admin.auth.admin.deleteUser(user.id);
  }

  console.log(
    JSON.stringify({
      runId,
      usersDeleted: runUsers.length,
      casesDeleted,
    }),
  );
});
