import "server-only";
import type { NhtsaResult } from "@/lib/vin/types";

// Free, no-key, no-registration government API (NHTSA's Open Data
// initiative) — confirmed live: no rate limit for single-VIN lookups, always
// returns HTTP 200 with validity signaled via Results[0].ErrorCode, even for
// garbage input. See docs/design (VIN decode plan) for the live-tested
// findings this integration is based on.
const DECODE_VIN_VALUES_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";

// This call sits inline in a guided UI step the user is actively waiting on
// (unlike src/lib/payments/creem.ts's fetch, which has no timeout at all) —
// an unbounded hang here would strand the intake flow, so it gets one
// deliberately.
const NHTSA_TIMEOUT_MS = 8000;

export async function fetchNhtsaDecodeVinValues(vin: string): Promise<NhtsaResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NHTSA_TIMEOUT_MS);

  try {
    const res = await fetch(`${DECODE_VIN_VALUES_URL}/${encodeURIComponent(vin)}?format=json`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`NHTSA vPIC decode failed (${res.status})`);
    }

    const data = (await res.json()) as { Results?: NhtsaResult[] };
    const result = data.Results?.[0];
    if (!result) {
      throw new Error("NHTSA vPIC decode returned no results");
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
