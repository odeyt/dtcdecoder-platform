import type { DtcCodeTranslatable, LocalizedDtcCode } from "@/lib/dtc-translation";

// Orchestrates resolving a localized DTC code: registry gate -> cache ->
// translate -> persist, English canonical as the universal fallback. No
// entitlement/quota reservation here (unlike scan-report/Diagnostic Engine
// translation) -- DTC translation is free for every visitor by design (see
// docs/DTC_PAGE_LOCALIZATION.md); the only gate is whether the registry
// marks this locale ai_output_enabled at all. Dependencies are injected so
// this decision logic is unit-tested without a DB or a live provider key.

export interface PersistDtcLocalizationRow {
  dtcCodeId: string;
  localeCode: string;
  localized: DtcCodeTranslatable;
  meta: Pick<
    LocalizedDtcCode,
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

export interface LocalizedDtcCodeDeps {
  /** isAiOutputEnabledLocale-backed: is this locale eligible for AI translation at all? */
  isLocaleAllowed(locale: string): Promise<boolean>;
  loadCache(dtcCodeId: string, locale: string): Promise<{ localized: DtcCodeTranslatable; status: string } | null>;
  loadCanonical(dtcCodeId: string): Promise<{ canonical: DtcCodeTranslatable; version: number } | null>;
  translate(args: {
    dtcCodeId: string;
    version: number;
    targetLocale: string;
    canonical: DtcCodeTranslatable;
  }): Promise<LocalizedDtcCode>;
  persist(row: PersistDtcLocalizationRow): Promise<void>;
}

export interface ResolvedLocalizedDtcCode {
  localized: DtcCodeTranslatable;
  resolvedLocale: string;
  fallbackUsed: boolean;
  status: "completed" | "fallback" | "failed" | "not_eligible" | "english";
}

export async function resolveLocalizedDtcCode(
  deps: LocalizedDtcCodeDeps,
  params: { dtcCodeId: string; targetLocale: string },
): Promise<ResolvedLocalizedDtcCode> {
  const canonEnglish = async (
    status: ResolvedLocalizedDtcCode["status"],
    fallbackUsed: boolean,
  ): Promise<ResolvedLocalizedDtcCode> => {
    const canon = await deps.loadCanonical(params.dtcCodeId);
    return {
      localized: canon?.canonical ?? {
        title: "",
        metaDescription: null,
        meaning: "",
        symptoms: [],
        causes: [],
        diagnosticSteps: [],
        commonMistakes: null,
        faq: [],
      },
      resolvedLocale: "en",
      fallbackUsed,
      status,
    };
  };

  if (params.targetLocale === "en") return canonEnglish("english", false);

  if (!(await deps.isLocaleAllowed(params.targetLocale))) return canonEnglish("not_eligible", false);

  const cached = await deps.loadCache(params.dtcCodeId, params.targetLocale);
  if (cached && cached.status === "completed") {
    return { localized: cached.localized, resolvedLocale: params.targetLocale, fallbackUsed: false, status: "completed" };
  }

  const canon = await deps.loadCanonical(params.dtcCodeId);
  if (!canon) return canonEnglish("english", false);

  let result: LocalizedDtcCode;
  try {
    result = await deps.translate({
      dtcCodeId: params.dtcCodeId,
      version: canon.version,
      targetLocale: params.targetLocale,
      canonical: canon.canonical,
    });
  } catch {
    return { localized: canon.canonical, resolvedLocale: "en", fallbackUsed: true, status: "failed" };
  }

  if (result.fallbackUsed || result.status !== "completed") {
    return { localized: canon.canonical, resolvedLocale: "en", fallbackUsed: true, status: result.status };
  }

  try {
    await deps.persist({
      dtcCodeId: params.dtcCodeId,
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
    // swallow -- cache write failure is non-fatal
  }

  return { localized: result.localized, resolvedLocale: params.targetLocale, fallbackUsed: false, status: "completed" };
}
