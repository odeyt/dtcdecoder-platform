import {
  getActiveSubscriptionCounts,
  estimateMonthlyRecurringRevenueUsd,
  getReportCostRollup,
  getTopCostReports,
  getAddOnPackRollup,
  getUsersApproachingLimit,
  estimateGrossMargin,
} from "@/lib/admin-profitability";
import { PAID_PLANS, AI_DIAGNOSTIC_ENTITLEMENTS, COST_GUARDS, ADD_ON_PACKS } from "@/lib/pricing";
import { MODEL_ROUTES } from "@/lib/ai-diagnostics/model-routing";
import { MODEL_PRICING } from "@/lib/ai-diagnostics/cost";

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default async function AdminProfitabilityPage() {
  const [subscriptionCounts, costRollup, topReports, addOnRollup, usersNearLimit] = await Promise.all([
    getActiveSubscriptionCounts(),
    getReportCostRollup(),
    getTopCostReports(10),
    getAddOnPackRollup(),
    getUsersApproachingLimit(),
  ]);

  const revenueUsd = estimateMonthlyRecurringRevenueUsd(subscriptionCounts);
  const margin = estimateGrossMargin(revenueUsd, costRollup.totalCostUsd);

  // Comped accounts are surfaced rather than filtered out of sight: they
  // consume AI budget like any paid account, so the cost figures below
  // include their usage while the revenue figure above deliberately does not.
  const compedTotal = subscriptionCounts.compedPro + subscriptionCounts.compedWorkshop;
  const compedListValueUsd = estimateMonthlyRecurringRevenueUsd({
    pro: subscriptionCounts.compedPro,
    workshop: subscriptionCounts.compedWorkshop,
    compedPro: 0,
    compedWorkshop: 0,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Profitability</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Current calendar month, UTC. Revenue is an estimate from paid-subscription counts x list price — this
        schema doesn&apos;t store actual Creem-charged amounts anywhere, so treat it as a rough operational figure,
        not a verified financial number. Comped accounts (granted, never billed) are excluded from revenue and
        shown separately; their AI usage still counts toward the costs below. Subscriptions whose billing period
        has ended are excluded even if still marked active. Do not treat any margin shown here as verified until
        real production usage exists.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Revenue &amp; users</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Stat label="Paid Pro subscribers" value={String(subscriptionCounts.pro)} />
          <Stat label="Paid Workshop subscribers" value={String(subscriptionCounts.workshop)} />
          <Stat label="Estimated MRR" value={usd(revenueUsd)} />
        </div>
        {compedTotal > 0 && (
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Stat
              label="Comped Pro accounts"
              value={String(subscriptionCounts.compedPro)}
              hint="Granted, not billed. Full entitlement, no revenue — excluded from MRR above."
            />
            <Stat
              label="Comped Workshop accounts"
              value={String(subscriptionCounts.compedWorkshop)}
              hint="Granted, not billed. Full entitlement, no revenue — excluded from MRR above."
            />
            <Stat
              label="List value of comped accounts"
              value={usd(compedListValueUsd)}
              hint="What these accounts would bill at list price if they were paid. Shown as the cost of comping, not as revenue."
            />
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">AI reports this month</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <Stat label="Completed reports" value={String(costRollup.totalCompletedReports)} />
          <Stat
            label="Failed / released attempts"
            value={String(costRollup.totalFailedAttempts)}
            hint="Every released reservation is paired with a failed cost-ledger row — released rows themselves are hard-deleted, not flagged, so this count is the closest available proxy."
          />
          <Stat label="Total estimated cost" value={usd(costRollup.totalCostUsd)} />
          <Stat label="Avg cost / completed report" value={usd(costRollup.avgCostPerCompletedReportUsd)} />
        </div>

        {costRollup.byPlan.length > 0 && (
          <RollupTable
            title="By plan"
            rows={costRollup.byPlan.map((r) => [r.plan, String(r.completedReports), String(r.failedAttempts), usd(r.totalCostUsd)])}
            headers={["Plan", "Completed", "Failed", "Cost"]}
          />
        )}
        {costRollup.byModel.length > 0 && (
          <RollupTable
            title="By model (routing check — see model-routing.ts)"
            rows={costRollup.byModel.map((r) => [r.modelId, String(r.completedReports), usd(r.totalCostUsd)])}
            headers={["Model", "Completed", "Cost"]}
          />
        )}
        {costRollup.byOperationType.length > 0 && (
          <RollupTable
            title="By operation type"
            rows={costRollup.byOperationType.map((r) => [r.operationType, String(r.completedReports), usd(r.totalCostUsd)])}
            headers={["Operation", "Completed", "Cost"]}
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Highest-cost reports</h2>
        {topReports.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No completed reports with recorded cost yet.</p>
        ) : (
          <RollupTable
            title={null}
            headers={["User", "Plan", "Model", "Operation", "Cost", "Date"]}
            rows={topReports.map((r) => [
              r.userId.slice(0, 8),
              r.plan,
              r.modelId,
              r.operationType,
              usd(r.costUsd),
              new Date(r.createdAt).toLocaleDateString(),
            ])}
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Add-on report packs</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Stat label="Total purchased" value={String(addOnRollup.totalPurchased)} />
          <Stat label="Total consumed" value={String(addOnRollup.totalConsumed)} />
          <Stat label="Total remaining" value={String(addOnRollup.totalRemaining)} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Users approaching their monthly limit</h2>
        <p className="mt-1 text-xs text-zinc-500">80% or more of their plan&apos;s included monthly report allowance.</p>
        {usersNearLimit.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No one is close to their limit right now.</p>
        ) : (
          <RollupTable
            title={null}
            headers={["User", "Plan", "Used", "Limit", "%"]}
            rows={usersNearLimit.map((u) => [
              u.userId.slice(0, 8),
              u.plan,
              String(u.reportsUsedThisMonth),
              String(u.monthlyLimit),
              `${Math.round(u.usedPct * 100)}%`,
            ])}
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Estimated gross margin</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Stat label="Estimated revenue" value={usd(margin.revenueUsd)} />
          <Stat label="Estimated cost" value={usd(margin.costUsd)} />
          <Stat
            label="Estimated margin"
            value={margin.marginPct === null ? "—" : `${margin.marginPct.toFixed(0)}%`}
            hint={`Target: ${COST_GUARDS.targetGrossMarginPct}% (operational default, not a marketing claim).`}
          />
        </div>
      </section>

      <section className="mt-10 border-t border-white/10 pt-6">
        <h2 className="text-lg font-semibold text-white">Current configuration (read-only)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Editing a value here requires changing src/lib/pricing.ts or src/lib/ai-diagnostics/model-routing.ts and
          redeploying — this page does not write to any config.
        </p>

        <RollupTable
          title="Plan quotas"
          headers={["Plan", "Reports / month", "Reports / day", "Seats", "PDF export"]}
          rows={Object.entries(AI_DIAGNOSTIC_ENTITLEMENTS).map(([plan, e]) => [
            plan,
            String(e.fullDiagnosticMonthlyLimit),
            String(e.fullDiagnosticDailyLimit),
            String(e.technicianSeatLimit),
            e.pdfExport ? "Yes" : "No",
          ])}
        />
        <RollupTable
          title="List prices"
          headers={["Plan", "Monthly", "Yearly"]}
          rows={(Object.keys(PAID_PLANS) as (keyof typeof PAID_PLANS)[]).map((plan) => [
            PAID_PLANS[plan].label,
            usd(PAID_PLANS[plan].monthlyPriceUsd),
            usd(PAID_PLANS[plan].yearlyPriceUsd),
          ])}
        />
        <RollupTable
          title="Add-on packs"
          headers={["Pack", "Reports", "Price"]}
          rows={ADD_ON_PACKS.map((p) => [p.id, String(p.reports), usd(p.priceUsd)])}
        />
        <RollupTable
          title="Cost guards"
          headers={["Target avg cost", "Warning threshold", "Hard ceiling", "Target margin"]}
          rows={[
            [
              usd(COST_GUARDS.targetAverageReportCostUsd),
              usd(COST_GUARDS.warningThresholdUsd),
              usd(COST_GUARDS.hardCeilingUsd),
              `${COST_GUARDS.targetGrossMarginPct}%`,
            ],
          ]}
        />
        <RollupTable
          title="Model routes"
          headers={["Task", "Model", "$/M input", "$/M output"]}
          rows={Object.entries(MODEL_ROUTES).map(([task, modelId]) => [
            task,
            modelId,
            MODEL_PRICING[modelId] ? `$${MODEL_PRICING[modelId].inputUsdPerMillionTokens}` : "—",
            MODEL_PRICING[modelId] ? `$${MODEL_PRICING[modelId].outputUsdPerMillionTokens}` : "—",
          ])}
        />
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}

function RollupTable({ title, headers, rows }: { title: string | null; headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-4">
      {title && <p className="text-sm font-semibold text-zinc-300">{title}</p>}
      <table className="mt-2 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-zinc-500">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 font-mono text-xs text-zinc-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
