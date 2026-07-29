# DTC Reference Architecture

Fixes the root cause of the "This code isn't in our reference database yet." fallback
appearing for codes like U1003, and expands the generic DTC reference layer. See the
delivery report in this project's commit history for the exact scope of what shipped
in this pass vs. what's deferred.

## Root cause (confirmed before writing any code)

`src/lib/landing-intake/engine.ts` — when the local DTC lookup found no matching row,
it returned one hardcoded fallback string regardless of *why* nothing matched. The
seed database had exactly 5 rows total (`P0128, P0171, P0300, P0420, P0455`) — zero
B/C/U codes — so almost anything outside that list, including a real,
correctly-shaped code like U1003, hit the same generic "not in database" message. This
was a data-and-classification gap, not a broken lookup path.

## What actually distinguishes U1003 from a genuinely-missing code

SAE J2012 assigns meaning by a code's own shape: the second character (`0`/`2` vs.
`1`/`3`) marks a code as **generic** (one universal SAE-defined meaning) or
**manufacturer-specific** (meaning defined independently by each OEM). U1003's second
character is `1` — it is *always* manufacturer-specific by definition, so there is no
single correct generic answer to publish for it. The old code treated "no row found"
as one situation; the fix is treating "no row, but the shape says generic" and "no
row, and the shape says manufacturer-specific" as two different, honestly-labeled
outcomes.

## Architecture

**Schema** (`supabase/migrations/0038_dtc_reference_expansion.sql`) — extends the
existing `dtc_codes` table additively (new nullable/defaulted columns:
`normalized_code`, `family`, `code_type`, `generic_definition`,
`manufacturer_specific`, `reserved_code`, `source_type/name/url/license/version/hash`,
`review_status`, `reviewed_by/at`, `active`) rather than introducing a parallel
"manufacturer definitions" table. `dtc_codes` already models generic-vs-manufacturer
as one table via nullable `make`/`model`/`engine_code` plus two partial unique
indexes (a generic row and a make-specific row can share one slug) — a second table
for the same concept would have been duplicate architecture. Two genuinely new tables
were added: `dtc_verified_repairs` (D1 Imports' own confirmed repair intelligence,
owner-scoped by `recorded_by_user_id` since this repo has no shop/organization
concept) and `dtc_dataset_imports` (service-role-only import provenance/audit trail).

**Normalization** (`src/lib/dtc-normalization.ts`) — one shared
`normalizeDtcInput()` utility: trims, uppercases, strips benign separators
(space/hyphen/underscore/period), rejects unsafe/malformed input before stripping
anything, validates the 1-letter + 3-4-digit shape, and classifies
generic/manufacturer-specific/category/subsystem purely from the code's own structure
(SAE J2012 — never a claim about a specific vehicle). Deliberately does **not** guess
which codes are "reserved by the standard" from shape alone — that requires an
authoritative per-code table this project doesn't have, and guessing would be exactly
the kind of fabrication this system exists to avoid. "Reserved" is instead a fact
recorded on a specific `dtc_codes` row (`reserved_code`) by a reviewer.

**Lookup service** (`src/lib/dtc-lookup.ts`) — `resolveDtcLookup(rawInput, vehicle?)`
is the one function that should resolve a code from here on. Order: normalize/validate
→ exact row (vehicle-scoped if context given, else generic) → if no exact row and the
code is manufacturer-specific by shape, return `vehicle_context_required` (never
`unknown`) → if no exact row and generic-shaped, return `unknown` with same-family
related codes offered alongside it. Database-first and synchronous with no AI call
anywhere in this path — the reference database remains the authoritative base layer.

**UI** (`src/components/ServiceBayHero.tsx`'s `ResultStep`) — branches on
`basicResult.resolutionType` to render one of: a full definition (generic/manufacturer
match found), "Manufacturer-specific code detected" with an add-vehicle-details CTA
and any known manufacturer variants, "We could not verify a published definition"
with concrete next steps, or a reserved-code notice — never a fabricated definition
for the middle two states.

## Data sourcing and licensing

All seeded content (`supabase/seed/seed_dtc_reference_expansion.sql`) is original
text written for this project — no content was copied from Identifix, Direct-Hit,
ALLDATA, Mitchell, or any other subscription service. Every `dtc_codes` row carries
`source_type` (`'original'` for everything shipped here), `source_name`,
`source_license`, `source_version`, and `source_hash` columns so future imports can
record real provenance. **This seed is a small, representative set for test/dev
purposes — U0100, one B-code (B0001), one C-code (C0035), and one deliberately
reserved code (C0300) — not a claim of a complete global DTC dataset.** U1003 is
intentionally *not* seeded with a generic definition, since it doesn't have one.

## What shipped in this pass vs. what's deferred

This pass fixed the actual reported bug (the fallback message and its root cause) and
built the reusable architecture underneath it. It did **not** attempt the full
import-pipeline CLI, the admin verified-repair recording workflow, dataset-import
observability events, or a Playwright e2e suite for this specific flow — those are
real, separate scopes and weren't rushed in alongside a production schema change and
a live bug fix in the same pass. See the delivery report for the complete list.
