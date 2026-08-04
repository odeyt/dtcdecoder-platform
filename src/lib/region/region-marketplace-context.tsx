"use client";

// MarketplaceProvider — derives its value from whatever RegionProvider
// currently holds, so it must be mounted underneath one. Holds only the
// static placeholder data in region-marketplace.ts; there is no fetch, no
// loading state, and no real supplier data here (see that file's comment).
import { createContext, useContext, type ReactNode } from "react";
import { useRegion } from "./region-hooks";
import { getMarketplaceProfile, type MarketplaceProfile } from "./region-marketplace";

const MarketplaceContext = createContext<MarketplaceProfile | null>(null);

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const region = useRegion();
  const value = getMarketplaceProfile(region.id);
  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

export function useMarketplace(): MarketplaceProfile {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) {
    throw new Error("useMarketplace() must be used within a MarketplaceProvider (nested under RegionProvider).");
  }
  return ctx;
}
