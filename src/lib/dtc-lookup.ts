// The DTC reference lookup service — the one function callers should use to
// resolve a code into an honest result, instead of re-deriving "found vs.
// not found" themselves. This is what fixes the U1003 case: a
// manufacturer-specific code with no database row is NOT the same situation
// as a generic code that's genuinely missing from our reference data, and
// this service is what tells those two apart instead of collapsing them
// into one "not in our database yet" message.
//
// The reference database is the authoritative base layer — this function
// never calls an AI provider and never invents a definition. See
// resolutionType below for what a caller should render for each case.
import { createClient } from "@/lib/supabase/server";
import { normalizeDtcInput, type NormalizedDtcResult } from "@/lib/dtc-normalization";
import type { DtcCode } from "@/lib/types";

export type DtcResolutionType =
  | "generic"
  | "manufacturer_exact"
  | "vehicle_context_required"
  | "reserved"
  | "unknown"
  | "invalid";

export interface VehicleContext {
  make?: string | null;
  model?: string | null;
  engineCode?: string | null;
}

export interface DtcLookupResult {
  rawInput: string;
  normalized: NormalizedDtcResult;
  resolutionType: DtcResolutionType;
  definition: DtcCode | null;
  availableManufacturers: string[];
  relatedCodes: DtcCode[];
}

async function findExactRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  normalizedCode: string,
  vehicle?: VehicleContext,
): Promise<DtcCode | null> {
  if (vehicle?.make) {
    const { data, error } = await supabase
      .from("dtc_codes")
      .select("*")
      .eq("normalized_code", normalizedCode)
      .eq("is_published", true)
      .eq("active", true)
      .eq("make", vehicle.make)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .eq("normalized_code", normalizedCode)
    .eq("is_published", true)
    .eq("active", true)
    .is("make", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findManufacturerVariants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  normalizedCode: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("make")
    .eq("normalized_code", normalizedCode)
    .eq("is_published", true)
    .eq("active", true)
    .not("make", "is", null);

  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => row.make as string).filter(Boolean)));
}

async function findRelatedCodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  normalizedCode: string,
  limitCount = 5,
): Promise<DtcCode[]> {
  const prefix = normalizedCode.slice(0, 3);
  if (prefix.length < 3) return [];

  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .eq("is_published", true)
    .eq("active", true)
    .is("make", null)
    .ilike("normalized_code", `${prefix}%`)
    .neq("normalized_code", normalizedCode)
    .order("normalized_code", { ascending: true })
    .limit(limitCount);

  if (error) throw error;
  return data ?? [];
}

export async function resolveDtcLookup(
  rawInput: string,
  vehicle?: VehicleContext,
): Promise<DtcLookupResult> {
  const normalized = normalizeDtcInput(rawInput);

  if (!normalized.isValid) {
    return {
      rawInput,
      normalized,
      resolutionType: "invalid",
      definition: null,
      availableManufacturers: [],
      relatedCodes: [],
    };
  }

  const supabase = await createClient();

  // An exact row already on record always wins, generic-structure guess or
  // not — a reviewer may have explicitly published a manufacturer-specific
  // OR a generic definition for this exact code already.
  const exact = await findExactRow(supabase, normalized.normalizedCode, vehicle);

  if (exact) {
    if (exact.reserved_code) {
      return {
        rawInput,
        normalized,
        resolutionType: "reserved",
        definition: exact,
        availableManufacturers: [],
        relatedCodes: [],
      };
    }

    const relatedCodes = await findRelatedCodes(supabase, normalized.normalizedCode);
    return {
      rawInput,
      normalized,
      resolutionType: exact.make ? "manufacturer_exact" : "generic",
      definition: exact,
      availableManufacturers: [],
      relatedCodes,
    };
  }

  // No exact row. If the code's own structure marks it manufacturer-specific
  // (SAE J2012 second-digit 1/3), the honest answer is "we need vehicle
  // context to look this up," never "not in our database yet" — this is
  // the fix for U1003 specifically.
  if (normalized.isManufacturerSpecific) {
    const availableManufacturers = await findManufacturerVariants(supabase, normalized.normalizedCode);
    return {
      rawInput,
      normalized,
      resolutionType: "vehicle_context_required",
      definition: null,
      availableManufacturers,
      relatedCodes: [],
    };
  }

  // Generic-shaped code with no row — genuinely missing content, not a
  // vehicle-context problem. Always "unknown" (never "generic" — that type
  // means a definition WAS found); related same-family codes are still
  // offered alongside the unknown state as a helpful consolation.
  const relatedCodes = await findRelatedCodes(supabase, normalized.normalizedCode);
  return {
    rawInput,
    normalized,
    resolutionType: "unknown",
    definition: null,
    availableManufacturers: [],
    relatedCodes,
  };
}
