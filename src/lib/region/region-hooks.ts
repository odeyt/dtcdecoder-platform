"use client";

// useRegion() — flattened, convenience-first view over the current
// RegionProfile. Returns the profile's own fields directly (region.currency,
// region.timezone, region.defaultMarketplace, ...) plus two aliases
// (`language` for defaultLanguage, `supplierRegion` for
// preferredSuppliers.country) so call sites don't need to know the
// underlying field names. Must be called under a <RegionProvider> — see
// region-context.tsx.
import { useRegionContext } from "./region-context";
import type { RegionProfile, RegionSource } from "./region-types";

export interface UseRegionResult extends RegionProfile {
  language: string;
  supplierRegion: string;
  source: RegionSource;
  setRegion: (profile: RegionProfile) => void;
}

export function useRegion(): UseRegionResult {
  const { region, source, setRegion } = useRegionContext();
  return {
    ...region,
    language: region.defaultLanguage,
    supplierRegion: region.preferredSuppliers.country,
    source,
    setRegion,
  };
}
