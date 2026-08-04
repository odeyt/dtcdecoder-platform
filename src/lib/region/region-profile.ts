// Static, code-committed region profiles. Adding a new country is adding
// one object here plus one entry in region-registry.ts's REGION_PROFILES
// map — see docs/REGION_PROFILE_EXPANSION.md. No other file should ever
// need a per-country branch/switch statement.
import type { RegionProfile } from "./region-types";

export const LAOS: RegionProfile = {
  id: "LA",
  name: "Laos",
  countryCode: "LA",
  defaultLanguage: "lo",
  supportedLanguages: ["lo", "en"],
  currency: "LAK",
  timezone: "Asia/Vientiane",
  measurementSystem: "metric",
  dateFormat: "DD/MM/YYYY",
  numberFormat: "lo-LA",
  preferredSuppliers: { country: "Laos" },
  defaultMarketplace: "Laos",
};

export const THAILAND: RegionProfile = {
  id: "TH",
  name: "Thailand",
  countryCode: "TH",
  defaultLanguage: "th",
  supportedLanguages: ["th", "en"],
  currency: "THB",
  timezone: "Asia/Bangkok",
  measurementSystem: "metric",
  dateFormat: "DD/MM/YYYY",
  numberFormat: "th-TH",
  preferredSuppliers: { country: "Thailand" },
  defaultMarketplace: "Thailand",
};

export const GLOBAL: RegionProfile = {
  id: "GLOBAL",
  name: "Global",
  countryCode: "GLOBAL",
  defaultLanguage: "en",
  supportedLanguages: ["en"],
  currency: "USD",
  timezone: "UTC",
  measurementSystem: "metric",
  dateFormat: "YYYY-MM-DD",
  numberFormat: "en-US",
  preferredSuppliers: { country: "Global" },
  defaultMarketplace: "Global",
};
