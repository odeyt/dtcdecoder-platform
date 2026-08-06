import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNhtsaDecodeVinValues } from "@/lib/vin/nhtsa";
import type { NhtsaResult, VinDecodeResult } from "@/lib/vin/types";

interface VinDecodeCacheRow {
  vin: string;
  is_valid: boolean;
  year: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine_cylinders: string | null;
  displacement_l: string | null;
  error_code: string;
  error_text: string | null;
}

function buildEngineSummary(cylinders: string, displacementL: string): string {
  const parts = [];
  if (cylinders) parts.push(`${cylinders}-cyl`);
  if (displacementL) parts.push(`${Number(displacementL).toFixed(1)}L`);
  return parts.join(", ");
}

function rowToResult(row: VinDecodeCacheRow): VinDecodeResult {
  return {
    valid: row.is_valid,
    vin: row.vin,
    year: row.year ?? "",
    make: row.make ?? "",
    model: row.model ?? "",
    trim: row.trim ?? "",
    engineSummary: buildEngineSummary(row.engine_cylinders ?? "", row.displacement_l ?? ""),
    errorCode: row.error_code,
    errorText: row.error_text ?? "",
  };
}

// NHTSA's own check-digit/registration validation (ErrorCode) is the source
// of truth for whether a VIN is real — this app builds no checksum
// validator of its own. "0" is a clean decode; Make/Model are required too
// since a partial/wildcarded VIN can return ErrorCode "0" with mostly-empty
// fields (see the live-tested findings behind this integration).
function isCleanDecode(result: NhtsaResult): boolean {
  return result.ErrorCode.trim() === "0" && Boolean(result.Make) && Boolean(result.Model);
}

// Looks up the permanent vin_decode_cache (migration 0050) first; on a miss,
// calls NHTSA's free vPIC API and caches the result — both clean decodes and
// known-bad VINs, so a repeated garbage VIN never re-hits NHTSA. `vin` must
// already be normalized (trimmed, uppercased, 17-char format-checked) by the
// caller.
export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const admin = createAdminClient();

  const { data: cached, error: lookupError } = await admin
    .from("vin_decode_cache")
    .select("vin, is_valid, year, make, model, trim, engine_cylinders, displacement_l, error_code, error_text")
    .eq("vin", vin)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (cached) return rowToResult(cached as VinDecodeCacheRow);

  const result = await fetchNhtsaDecodeVinValues(vin);
  const valid = isCleanDecode(result);

  const row: VinDecodeCacheRow = {
    vin,
    is_valid: valid,
    year: result.ModelYear || null,
    make: result.Make || null,
    model: result.Model || null,
    trim: result.Trim || result.Trim2 || null,
    engine_cylinders: result.EngineCylinders || null,
    displacement_l: result.DisplacementL || null,
    error_code: result.ErrorCode,
    error_text: result.ErrorText || null,
  };

  const { error: upsertError } = await admin
    .from("vin_decode_cache")
    .upsert({ ...row, raw_response: result }, { onConflict: "vin" });
  if (upsertError) throw upsertError;

  return rowToResult(row);
}
