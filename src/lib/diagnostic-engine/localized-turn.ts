import type { DiagnosticTurnTranslatable, LocalizedDiagnosticTurn } from "@/lib/diagnostic-engine/turn-translation";

// Orchestrates resolving a localized Diagnostic Engine turn: entitlement
// gate -> cache -> translate -> persist, English canonical as the universal
// fallback, no quota consumed on failure. Structurally identical to
// scan-diagnostics/localized-report.ts (kept as a separate, parallel module
// rather than generalizing that one with a type parameter, so the
// already-shipped, already-tested scan-report path is never put at risk by
// a refactor made under this feature's time pressure).

export interface PersistTurnLocalizationRow {
  turnCacheKey: string;
  localeCode: string;
  localized: DiagnosticTurnTranslatable;
  meta: Pick<
    LocalizedDiagnosticTurn,
    "resolvedLocale" | "status" | "fallbackUsed" | "provider" | "model" | "glossaryVersion" | "promptVersion" | "translatedAt" | "latencyMs"
  >;
}

export interface LocalizedTurnDeps {
  isLocaleAllowed(locale: string): Promise<boolean>;
  loadCache(turnCacheKey: string, locale: string): Promise<{ localized: DiagnosticTurnTranslatable; status: string } | null>;
  translate(args: {
    turnCacheKey: string;
    version: number;
    targetLocale: string;
    canonical: DiagnosticTurnTranslatable;
  }): Promise<LocalizedDiagnosticTurn>;
  persist(row: PersistTurnLocalizationRow): Promise<void>;
  reserveUsage(): Promise<boolean>;
  releaseUsage(): Promise<void>;
}

export interface ResolvedLocalizedTurn {
  localized: DiagnosticTurnTranslatable;
  resolvedLocale: string;
  fallbackUsed: boolean;
  status: "completed" | "fallback" | "failed" | "not_entitled" | "english";
}

// `turnCacheKey` is caller-computed (see turn-localization.ts) from a stable
// hash of the case's evidence + hypotheses + test-plan content, NOT a DB row
// id — a Diagnostic Engine turn has no single persisted "report id" the way
// a scan report does (case memory is a live, evolving graph, not a
// one-time-generated document). Same content -> same key -> cache hit;
// content that actually changed (new evidence, re-ranked hypotheses) ->
// different key -> a fresh translation, never a stale one silently served.
export async function resolveLocalizedTurn(
  deps: LocalizedTurnDeps,
  params: { turnCacheKey: string; version: number; targetLocale: string; canonical: DiagnosticTurnTranslatable },
): Promise<ResolvedLocalizedTurn> {
  if (params.targetLocale === "en") {
    return { localized: params.canonical, resolvedLocale: "en", fallbackUsed: false, status: "english" };
  }

  if (!(await deps.isLocaleAllowed(params.targetLocale))) {
    return { localized: params.canonical, resolvedLocale: "en", fallbackUsed: false, status: "not_entitled" };
  }

  const cached = await deps.loadCache(params.turnCacheKey, params.targetLocale);
  if (cached && cached.status === "completed") {
    return { localized: cached.localized, resolvedLocale: params.targetLocale, fallbackUsed: false, status: "completed" };
  }

  const reserved = await deps.reserveUsage();
  if (!reserved) {
    return { localized: params.canonical, resolvedLocale: "en", fallbackUsed: true, status: "fallback" };
  }

  let result: LocalizedDiagnosticTurn;
  try {
    result = await deps.translate({
      turnCacheKey: params.turnCacheKey,
      version: params.version,
      targetLocale: params.targetLocale,
      canonical: params.canonical,
    });
  } catch {
    await deps.releaseUsage();
    return { localized: params.canonical, resolvedLocale: "en", fallbackUsed: true, status: "failed" };
  }

  if (result.fallbackUsed || result.status !== "completed") {
    await deps.releaseUsage();
    return { localized: params.canonical, resolvedLocale: "en", fallbackUsed: true, status: result.status };
  }

  try {
    await deps.persist({
      turnCacheKey: params.turnCacheKey,
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
    // swallow — cache write failure is non-fatal, matches localized-report.ts
  }

  return { localized: result.localized, resolvedLocale: params.targetLocale, fallbackUsed: false, status: "completed" };
}
