// Region-aware display formatting — Intl only, never a hand-rolled currency
// symbol table or manual UTC-offset math (Intl.DateTimeFormat already knows
// every IANA timezone's real offset, including DST rules this app would
// otherwise have to track itself).
//
// This is DELIBERATELY separate from src/lib/currency.ts / src/lib/format.ts,
// which serve one specific existing job — formatting the converted display
// price of a paid product next to its fixed USD checkout price, driven by
// the admin-managed `currencies`/`currency_rates` tables. These functions
// serve a different job: formatting an arbitrary already-known amount/date
// the way a visitor from a given region expects to read it (e.g. a report's
// generated-at timestamp, a quantity, a distance). Nothing here converts an
// amount between currencies, and nothing here changes what a customer is
// actually charged.
import type { RegionProfile } from "./region-types";

export function formatRegionCurrency(amount: number, region: RegionProfile): string {
  return new Intl.NumberFormat(region.numberFormat, {
    style: "currency",
    currency: region.currency,
  }).format(amount);
}

export function formatRegionNumber(value: number, region: RegionProfile): string {
  return new Intl.NumberFormat(region.numberFormat).format(value);
}

// `region.dateFormat` (e.g. "DD/MM/YYYY") is a human-readable label for
// admin/reference use — the actual rendering always goes through
// Intl.DateTimeFormat, never a manual pattern-substitution, so real
// calendar/timezone rules apply. `calendar: "gregory"` is explicit rather
// than left to the locale's default because th-TH's default calendar is
// Buddhist Era (year = Gregorian + 543); every other date in this app is
// Gregorian, so silently switching calendars for Thai/Lao users would be a
// surprising inconsistency, not a feature.
export function formatRegionDate(date: Date, region: RegionProfile): string {
  return new Intl.DateTimeFormat(region.numberFormat, {
    timeZone: region.timezone,
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatRegionDateTime(date: Date, region: RegionProfile): string {
  return new Intl.DateTimeFormat(region.numberFormat, {
    timeZone: region.timezone,
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
