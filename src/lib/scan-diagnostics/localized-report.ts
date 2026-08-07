import type { ScanReportTranslatable, LocalizedScanReport } from "@/lib/scan-diagnostics/report-translation";

// Orchestrates resolving a localized scan report: entitlement gate → cache →
// translate → persist, with English canonical as the universal fallback and no
// quota consumed on failure. Dependencies are injected so this decision logic
// is unit-tested without a DB or a live provider key. The production wiring
// (getOrCreateLocalizedReport) supplies real implementations.

export interface PersistLocalizationRow {
  reportId: string;
  localeCode: string;
  localized: ScanReportTranslatable;
  meta: Pick<
    LocalizedScanReport,
    | "resolvedLocale"
    | "status"
    | "fallbackUsed"
    | "provider"
    | "model"
    | "glossaryVersion"
    | "promptVersion"
    | "translatedAt"
    | "latencyMs"
  >;
}

export interface LocalizedReportDeps {
  /** getAllowedOutputLocales-backed: is this locale offered for this plan? */
  isLocaleAllowed(locale: string): Promise<boolean>;
  /** Cached localized row (any status), or null. */
  loadCache(reportId: string, locale: string): Promise<{ localized: ScanReportTranslatable; status: string } | null>;
  /** Canonical English report fields + version, or null if not found. */
  loadCanonical(reportId: string): Promise<{ canonical: ScanReportTranslatable; version: number } | null>;
  translate(args: {
    reportId: string;
    version: number;
    targetLocale: string;
    canonical: ScanReportTranslatable;
  }): Promise<LocalizedScanReport>;
  persist(row: PersistLocalizationRow): Promise<void>;
  /** Reserve one paid-translation slot; false if over the entitlement limit. */
  reserveUsage(): Promise<boolean>;
  /** Release a reservation for a translation that failed after reserving. */
  releaseUsage(): Promise<void>;
}

export interface ResolvedLocalizedReport {
  localized: ScanReportTranslatable;
  resolvedLocale: string;
  fallbackUsed: boolean;
  status: "completed" | "fallback" | "failed" | "not_entitled" | "english";
}

export async function resolveLocalizedReport(
  deps: LocalizedReportDeps,
  params: { reportId: string; targetLocale: string },
): Promise<ResolvedLocalizedReport> {
  const canonEnglish = async (
    status: ResolvedLocalizedReport["status"],
    fallbackUsed: boolean,
  ): Promise<ResolvedLocalizedReport> => {
    const canon = await deps.loadCanonical(params.reportId);
    return {
      localized: canon?.canonical ?? { rankedCauses: [], recommendedTests: [], missingInformation: [], extractionWarnings: [] },
      resolvedLocale: "en",
      fallbackUsed,
      status,
    };
  };

  // English request → canonical, no translation.
  if (params.targetLocale === "en") return canonEnglish("english", false);

  // Entitlement gate (server-side; never trust the client).
  if (!(await deps.isLocaleAllowed(params.targetLocale))) return canonEnglish("not_entitled", false);

  // Cache hit (only a completed translation is served from cache).
  const cached = await deps.loadCache(params.reportId, params.targetLocale);
  if (cached && cached.status === "completed") {
    return { localized: cached.localized, resolvedLocale: params.targetLocale, fallbackUsed: false, status: "completed" };
  }

  const canon = await deps.loadCanonical(params.reportId);
  if (!canon) return canonEnglish("english", false);

  // Reserve a paid-translation slot; over-limit falls back to English.
  const reserved = await deps.reserveUsage();
  if (!reserved) return { localized: canon.canonical, resolvedLocale: "en", fallbackUsed: true, status: "fallback" };

  let result: LocalizedScanReport;
  try {
    result = await deps.translate({
      reportId: params.reportId,
      version: canon.version,
      targetLocale: params.targetLocale,
      canonical: canon.canonical,
    });
  } catch {
    await deps.releaseUsage();
    return { localized: canon.canonical, resolvedLocale: "en", fallbackUsed: true, status: "failed" };
  }

  if (result.fallbackUsed || result.status !== "completed") {
    // Failed/partial translation does NOT consume the paid slot.
    await deps.releaseUsage();
    return { localized: canon.canonical, resolvedLocale: "en", fallbackUsed: true, status: result.status };
  }

  // Persist best-effort; a persistence error must not fail the request (the
  // translation succeeded — serve it; the row is a cache, not the source).
  try {
    await deps.persist({
      reportId: params.reportId,
      localeCode: params.targetLocale,
      localized: result.localized,
      meta: {
        resolvedLocale: result.resolvedLocale,
        status: result.status,
        fallbackUsed: result.fallbackUsed,
        provider: result.provider,
        model: result.model,
        glossaryVersion: result.glossaryVersion,
        promptVersion: result.promptVersion,
        translatedAt: result.translatedAt,
        latencyMs: result.latencyMs,
      },
    });
  } catch {
    // swallow — cache write failure is non-fatal
  }

  return { localized: result.localized, resolvedLocale: params.targetLocale, fallbackUsed: false, status: "completed" };
}
