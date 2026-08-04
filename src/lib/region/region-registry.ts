// Single source of truth for region lookups. Every part of the app that
// needs a RegionProfile goes through this file — never a per-country
// switch/if-chain elsewhere. Adding a country: add its profile to
// region-profile.ts, add one line to REGION_PROFILES below. Nothing else
// changes (region-resolver.ts, RegionProvider, useRegion, the settings
// selector, and the geo-detection banner all already iterate this map).
import { LAOS, THAILAND, GLOBAL } from "./region-profile";
import type { RegionId, RegionProfile } from "./region-types";

export const REGION_PROFILES: Record<string, RegionProfile> = {
  LA: LAOS,
  TH: THAILAND,
  GLOBAL: GLOBAL,
};

export const DEFAULT_REGION_ID: RegionId = "GLOBAL";

export function isRecognizedRegionId(id: string | null | undefined): id is RegionId {
  return !!id && id in REGION_PROFILES;
}

export function getRegionProfile(id: string | null | undefined): RegionProfile {
  if (isRecognizedRegionId(id)) return REGION_PROFILES[id];
  return REGION_PROFILES[DEFAULT_REGION_ID];
}

export function listRegionProfiles(): RegionProfile[] {
  return Object.values(REGION_PROFILES);
}

// Reverse lookup used by the browser-locale tier of the resolver and by the
// geo-detection banner: which region (if any) has this ISO country code as
// its own countryCode. Global has none, so it's never matched here.
export function findRegionByCountryCode(countryCode: string | null | undefined): RegionProfile | null {
  if (!countryCode) return null;
  const upper = countryCode.toUpperCase();
  return listRegionProfiles().find((p) => p.countryCode === upper) ?? null;
}
