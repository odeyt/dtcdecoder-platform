// Phase 1 branding regression coverage (docs/PHASE_1_BRANDING_STANDARD.md).
// Scoped to what has actually been migrated so far — the DTC Technician™
// consultation surface (Slice 1). This file grows namespace-by-namespace as
// later slices migrate nav/footer/hero/pricing/account/report copy (Slice
// 6) and additional locales (Slice 7), rather than asserting a final state
// that doesn't exist yet.
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";
import {
  BRAND_NAME,
  BRAND_SUBTITLE,
  PROHIBITED_CUSTOMER_FACING_TERM_PATTERNS,
} from "@/lib/branding/terminology";

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

function assertNoProhibitedTerms(catalog: Record<string, unknown>, label: string) {
  const strings = collectStrings(catalog);
  for (const pattern of PROHIBITED_CUSTOMER_FACING_TERM_PATTERNS) {
    const offenders = strings.filter((s) => pattern.test(s));
    expect(offenders, `${label}: found prohibited term matching ${pattern} in: ${JSON.stringify(offenders)}`).toHaveLength(0);
  }
}

describe("Phase 1 branding — dtcTechnician namespace (Slice 1)", () => {
  it("the old 'aiAssistant' namespace no longer exists in English or Spanish", () => {
    expect(en).not.toHaveProperty("aiAssistant");
    expect(es).not.toHaveProperty("aiAssistant");
  });

  it("a 'dtcTechnician' namespace exists in English and Spanish with the brand name", () => {
    expect(en).toHaveProperty("dtcTechnician.title", "DTC Technician™");
    expect(es).toHaveProperty("dtcTechnician.title", "DTC Technician™");
  });

  it("the dtcTechnician namespace contains no prohibited customer-facing terms", () => {
    assertNoProhibitedTerms((en as Record<string, unknown>).dtcTechnician as Record<string, unknown>, "en.dtcTechnician");
    assertNoProhibitedTerms((es as Record<string, unknown>).dtcTechnician as Record<string, unknown>, "es.dtcTechnician");
  });

  it("uses 'Diagnostic Consultation' / 'Consulta de Diagnóstico' terminology instead of 'chat'", () => {
    const enStrings = collectStrings((en as Record<string, unknown>).dtcTechnician).join(" ").toLowerCase();
    expect(enStrings).not.toMatch(/\bchat\b/);
    expect(enStrings).toMatch(/diagnostic consultation|diagnostic case/i);
  });
});

describe("Phase 1 branding — global terminology rollout (Slice 6)", () => {
  const SWEPT_NAMESPACES = [
    "nav",
    "footer",
    "home",
    "pricing",
    "account",
    "preferences",
    "dtcResult",
    "dtcSearch",
    "history",
    "meta",
    "scanReport",
  ] as const;

  it.each(SWEPT_NAMESPACES)("en.%s has no prohibited customer-facing terms", (ns) => {
    assertNoProhibitedTerms((en as Record<string, unknown>)[ns] as Record<string, unknown>, `en.${ns}`);
  });

  it.each(SWEPT_NAMESPACES)("es.%s has no prohibited customer-facing terms", (ns) => {
    assertNoProhibitedTerms((es as Record<string, unknown>)[ns] as Record<string, unknown>, `es.${ns}`);
  });

  it("nav uses the approved terminology (Quick Code Lookup, DTC Technician™, Professional Scan Analysis)", () => {
    expect(en).toHaveProperty("nav.dtcLookup", "Quick Code Lookup");
    expect(en).toHaveProperty("nav.aiDiagnostic", "DTC Technician™");
    expect(en).toHaveProperty("nav.scanDiagnostics", "Professional Scan Analysis");
  });

  it("history is relabeled Consultation History", () => {
    expect(en).toHaveProperty("history.title", "Consultation History");
    expect(es).toHaveProperty("history.title", "Historial de Consultas");
  });

  it("pricing bullets reference Professional Diagnostic Reports, not AI diagnostic reports", () => {
    const enPricing = collectStrings((en as Record<string, unknown>).pricing).join(" ");
    expect(enPricing).toMatch(/Professional Diagnostic Report/);
    expect(enPricing).not.toMatch(/AI diagnostic report/i);
  });
});

describe("Phase 1 branding — report labels (ScanReportView.tsx)", () => {
  it("no longer labels report sections as raw 'AI-generated' content", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("../src/components/ScanReportView.tsx", import.meta.url), "utf-8");
    expect(source).not.toMatch(/AI-generated/);
    expect(source).not.toMatch(/AI-assisted evidence review/);
  });

  // As of the Diagnostic Workbench redesign, ScanReportView.tsx's copy is
  // fully localized (scanReport namespace) rather than hardcoded — so the
  // brand-wording check now reads the message catalog instead of grepping
  // the component source, same as every other already-migrated namespace
  // above.
  it("the scanReport namespace uses the DTC Technician™ prepared-by wording", () => {
    expect(en).toHaveProperty("scanReport.preparedBadge", "Prepared by DTC Technician™ — not OEM service information");
    expect(es).toHaveProperty(
      "scanReport.preparedBadge",
      "Preparado por DTC Technician™ — no es información de servicio OEM",
    );
  });
});

describe("Phase 1 branding registry", () => {
  it("defines the canonical brand name with the trademark symbol", () => {
    expect(BRAND_NAME).toBe("DTC Technician™");
    expect(BRAND_SUBTITLE).toBe("Professional Diagnostic Copilot");
  });

  it("never matches its own brand name as a prohibited term (sanity check on the regex list)", () => {
    for (const pattern of PROHIBITED_CUSTOMER_FACING_TERM_PATTERNS) {
      expect(pattern.test(BRAND_NAME)).toBe(false);
      expect(pattern.test(BRAND_SUBTITLE)).toBe(false);
    }
  });
});

describe("Phase 1 branding — internal identifiers stay stable", () => {
  it("does not rename internal provider/orchestration class names", async () => {
    const fs = await import("node:fs/promises");
    const anthropic = await fs.readFile(
      new URL("../src/lib/scan-diagnostics/ai/anthropic-provider.ts", import.meta.url),
      "utf-8",
    );
    const openai = await fs.readFile(
      new URL("../src/lib/scan-diagnostics/ai/openai-provider.ts", import.meta.url),
      "utf-8",
    );
    expect(anthropic).toContain("class AnthropicDiagnosticProvider");
    expect(openai).toContain("class OpenAiDiagnosticProvider");
  });
});
