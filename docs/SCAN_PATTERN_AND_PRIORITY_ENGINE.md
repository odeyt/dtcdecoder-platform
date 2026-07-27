# Scan Pattern and Priority Engine

Documents the deterministic, pre-AI pattern detection and diagnostic-priority ranking
added alongside the [full scan ingestion rebuild](FULL_SCAN_INGESTION_ARCHITECTURE.md).
Both operate purely on the canonical extracted record (`canonical-scan.ts`) — neither
ever reads or depends on an AI response, and the AI's own reasoning is informed by their
output, never the other way around.

## Pattern engine (`src/lib/scan-diagnostics/patterns.ts`)

`detectPatterns(scan: CanonicalVehicleScan): DetectedPattern[]` runs seven independent
rule functions, each returning a finding or `null`:

| Pattern | Trigger | Severity |
|---|---|---|
| `multi_module_low_voltage` | ≥2 battery-relevant DTCs across ≥2 distinct systems | warn |
| `network_communication_event` | ≥3 network-relevant DTCs across ≥2 distinct systems | warn |
| `single_node_failure` | ≥3 "lost communication with X" mentions naming the SAME target X, across ≥2 systems | critical |
| `bus_off_condition` | any bus-off-relevant DTC | critical |
| `current_powertrain_with_historical_secondary` | ≥1 current P-code AND ≥3 historical network-relevant DTCs | warn |
| `safety_system_active_fault` | any current DTC in a safety-relevant system (SRS/ABS/steering/brake/restraint) | critical |
| `possible_common_cause` | low-voltage or network-event pattern present AND total DTC count ≥10 | warn |

`single_node_failure`'s target extraction (`extractLostCommTarget`) parses phrases like
"Lost Communication With EMS" to find what module is most consistently reported as
unreachable — a genuine structural signal distinct from "network faults exist somewhere."
For the Zotye case, EMS is named as the lost target from three independent systems
(Instrument Cluster, Electric Power Steering, Gateway) — exactly the kind of
cross-system corroboration this pattern exists to surface.

`possible_common_cause` is deliberately phrased as a hypothesis in its own evidence
payload (`"Hypothesis only — requires power/ground/network confirmation..."`) — it is
never asserted as a confirmed root cause, and the safety-rules engine (see below) has a
dedicated backstop for an AI recommendation that skips straight to module replacement in
this context.

Patterns are persisted to `scan_patterns` once, at analysis time, before the AI is ever
called (`analyze.ts`) — not recomputed per page view — so the record an admin inspects
later reflects exactly what informed that specific AI run. `PATTERN_RULES_VERSION`
(`2026-07-pattern-v1`) is stored per row for traceability if the rules change later.

## Diagnostic priority engine (`src/lib/scan-diagnostics/priority.ts`)

`computeDiagnosticPriority(scan, patterns)` buckets every extracted DTC into exactly one
of four groups, in this precedence order:

1. **Fix first** — `status === "current"` AND (`safetyRelevance` OR `busOffRelevance`).
2. **Diagnose next** — `status === "current"`, everything else.
3. **Monitor/recheck** — `status === "history"`.
4. **Historical/reference-only** — everything else (`reference_only`, `unknown`,
   `pending`, `permanent`, `intermittent`, `stored`, or no status stated at all).

This ordering is the hierarchy the mega-spec required: a current, safety-relevant fault
always outranks a historical one; a reference-only generic code (like `P0015`/`P000B`
in the Zotye case — both explicitly "Generic Type DTC, reference Only" in the source)
never outranks a current fault (`B1054FF`, `P000A`), regardless of how the AI's own
`rankedCauses` happens to order things. Every extracted DTC lands in exactly one bucket
— see `test/scan-patterns-and-priority.test.ts`'s "accounts for every extracted DTC"
assertion.

Priority is recomputed on every read (report-access.ts, admin inspection screen) rather
than persisted — it's a pure, cheap function of already-persisted DTC status/relevance
data, so there's no staleness risk and no extra migration/column needed for it.

## Confidence engine changes (`src/lib/scan-diagnostics/confidence.ts`)

`CONFIDENCE_FORMULA_VERSION` (`2026-07-confidence-v2`) replaces the prior formula, which
only considered VIN presence, complaint/symptoms, image-only-PDF, extraction warnings,
safety verdict, and missing-information count. New factors:

**Positive:**
- +5 — year, make, AND model all identified.
- +3 each — freeze-frame data present, live data present.
- +5 — corroborated across ≥3 distinct faulted systems.
- +2 — ≥1 system explicitly confirmed OK by the source (narrows scope).
- +5 — ≥1 deterministic critical-severity pattern detected.
- +3 — at least one current, safety-relevant fault clearly identified for priority.
- +5 — extraction is complete (all declared DTCs across all systems were extracted).

**Negative (new, beyond the pre-existing VIN/complaint/image-only-PDF/warnings/safety
deductions):**
- -5 — no year/make/model identified at all.
- -3 — no mileage.
- -5 each — no freeze-frame data, no live data.
- -15 — extraction marked truncated (a system declared more DTCs than were extracted).
- -8 — more than half of extracted DTCs are reference-only/unknown-status with no
  manufacturer-specific definition available.

The score is still clamped to `[10, 95]` and banded into the same four categorical
levels (`high`/`medium`/`low`/`insufficient_evidence`) — a bare percentage is still
never presented as a calibrated real-world probability (see
`docs/DIAGNOSTIC_SAFETY_RULES.md`). `formulaVersion` is included in `ConfidenceResult`
and folded into the persisted `confidence_rationale` array (no new `scan_reports` column
needed) so an older report's score is never silently reinterpreted under a newer
formula.

## Safety-rules addition (`src/lib/scan-diagnostics/safety-rules.ts`)

New rule `comm-fault-module-replacement-without-power-ground-network-tests` (severity
`warn`): fires when the AI's output both (a) mentions replacing a high-cost module
(ECU/PCM/BCM/TCM/etc. — the same `HIGH_COST_MODULE_PATTERN` the existing rules use) and
(b) the surrounding text matches communication/network-fault context (lost
communication, bus-off, frame lost, node missing, a `U0`-prefixed code, ...) — but NONE
of the recommended tests mention power, ground, battery, or network-specific checks
(voltage, resistance, termination, continuity, splice points). A communication DTC is
frequently a wiring/power/ground issue upstream of the module the code happens to be
reported against, not the module itself — this is a deterministic backstop for that,
distinct from the existing "was ANY test recommended" rules, and independent of whether
the system prompt's own instruction to this effect was followed.
