import type { Metadata } from "next";
import { getGenericDtcCode, getRelatedDtcCodes } from "@/lib/dtc";
import { isValidDtcCodeFormat } from "@/lib/dtc-category";
import { DtcCodeResult } from "@/components/DtcCodeResult";
import { UnknownDtcResult } from "@/components/UnknownDtcResult";
import { InvalidDtcCodeResult } from "@/components/InvalidDtcCodeResult";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { accessLevelForDtcContent, filterDtcCodeForAccessLevel } from "@/lib/dtc-redaction";
import { recordSearchHistory } from "@/lib/search-history";
import { buildLocaleAlternates } from "@/lib/i18n/metadata";
import { recordEvent } from "@/lib/analytics/events";
import { detectSafetyWarnings } from "@/lib/safety-warnings";
import { getOrCreateLocalizedDtcCode, applyLocalizedDtcCode } from "@/lib/dtc-code-localization";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string; code: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  const dtc = await getGenericDtcCode(code.toLowerCase());
  if (!dtc || !dtc.is_published) return {};

  // The title/description themselves stay in the DTC code's original
  // English (admin-authored, no per-locale content exists yet — see
  // dtcResult.contentNotLocalizedNote) — only the alternates/hreflang
  // structure is locale-aware.
  return {
    title: dtc.title,
    description: dtc.meta_description ?? dtc.meaning,
    alternates: await buildLocaleAlternates(locale, `/dtc/${dtc.slug}`),
  };
}

// Three distinct outcomes, never a bare 404 for anything that merely looks
// like a real code attempt — a 404 gives a searching technician nothing to
// act on. Only a genuinely malformed input (not shaped like any DTC code)
// gets the lightweight invalid-format view; a well-formed code we simply
// haven't published yet gets the rich fallback (category, related codes,
// AI-report CTA) instead of an empty page. Static page views never touch
// basic-search quota either way — unchanged from before this page grew a
// fallback state.
export default async function GenericDtcCodePage({ params }: Props) {
  const { code, locale } = await params;
  const normalizedCode = code.toUpperCase();

  if (!isValidDtcCodeFormat(normalizedCode)) {
    return (
      <div className="container-app px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <InvalidDtcCodeResult code={code} />
        </div>
      </div>
    );
  }

  const dtc = await getGenericDtcCode(code.toLowerCase());

  if (dtc && dtc.is_published) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const plan = user ? await getEffectivePlan(user.id, user.email ?? null) : "free";
    if (user) {
      recordSearchHistory(user.id, "lookup", dtc.code, dtc.id).catch(() => {});
    }
    await recordEvent("ai_diagnosis_cta_viewed", { userId: user?.id ?? null, metadata: { source: "known_dtc_page" } });

    // Always computed from the CANONICAL English row, before any
    // localization is applied — an English-keyword regex scanner would
    // silently miss real danger conditions in translated text.
    const warningText = [dtc.meaning, dtc.symptoms.join(" "), dtc.causes.join(" "), dtc.drive_recommendation ?? ""].join(
      " ",
    );
    const safetyWarnings = detectSafetyWarnings(warningText);

    // Translate BEFORE redaction: one shared (dtc_code_id, locale) cache
    // entry serves every visitor regardless of plan, and the existing
    // redaction logic then strips locked fields identically whether the
    // underlying text is English or translated.
    let localizedDtc = dtc;
    let showUntranslatedNote = false;
    if (locale !== "en") {
      const localization = await getOrCreateLocalizedDtcCode(dtc.id, locale);
      if (localization.status === "completed") {
        localizedDtc = applyLocalizedDtcCode(dtc, localization.localized);
      } else {
        showUntranslatedNote = true;
      }
    }

    const redacted = filterDtcCodeForAccessLevel(localizedDtc, accessLevelForDtcContent(plan));
    // signedIn drives only which CTA the upsell panel renders (direct
    // checkout vs sign-in-then-resume). Entitlement itself is still decided
    // server-side by `plan` above — this is not an authorization signal.
    return (
      <DtcCodeResult
        dtc={redacted.visible}
        redaction={redacted}
        signedIn={Boolean(user)}
        safetyWarnings={safetyWarnings}
        showUntranslatedNote={showUntranslatedNote}
      />
    );
  }

  const relatedCodes = await getRelatedDtcCodes(normalizedCode);
  await recordEvent("ai_diagnosis_cta_viewed", { userId: null, metadata: { source: "unknown_dtc_page" } });
  return (
    <div className="container-app px-6 py-12">
      <UnknownDtcResult code={normalizedCode} relatedCodes={relatedCodes} />
    </div>
  );
}
