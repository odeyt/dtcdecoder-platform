// Marketplace/supplier placeholder architecture — interfaces and static
// reference data only, per the Region Profile spec: "No supplier
// implementation yet. Only architecture." / "Only create interfaces. Do not
// build supplier integrations." Nothing here calls a real supplier API,
// checks live inventory, or places an order — SUPPLIER_SOURCES below is
// reference data for a future integration, not a working feature.
import type { RegionId } from "./region-types";

export type SupplierSourceKind = "marketplace" | "dealer_network" | "aftermarket" | "local_distributor" | "importer";

export interface SupplierSource {
  name: string;
  kind: SupplierSourceKind;
}

export interface MarketplaceProfile {
  regionId: RegionId;
  marketplaceName: string;
  /** Ordered by the priority this region's future integration would try
   *  them in — not yet wired to anything. */
  supplierSources: SupplierSource[];
}

export const MARKETPLACE_PROFILES: Record<RegionId, MarketplaceProfile> = {
  LA: {
    regionId: "LA",
    marketplaceName: "Laos Suppliers",
    supplierSources: [
      { name: "Partsouq", kind: "marketplace" },
      { name: "Local Dealers", kind: "dealer_network" },
      { name: "Importers", kind: "importer" },
    ],
  },
  TH: {
    regionId: "TH",
    marketplaceName: "Thailand Suppliers",
    supplierSources: [
      { name: "Dealer Network", kind: "dealer_network" },
      { name: "Aftermarket", kind: "aftermarket" },
      { name: "Local Distributors", kind: "local_distributor" },
    ],
  },
  GLOBAL: {
    regionId: "GLOBAL",
    marketplaceName: "Global Suppliers",
    supplierSources: [],
  },
};

export function getMarketplaceProfile(regionId: RegionId): MarketplaceProfile {
  return MARKETPLACE_PROFILES[regionId] ?? MARKETPLACE_PROFILES.GLOBAL;
}
