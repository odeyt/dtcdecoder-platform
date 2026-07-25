// The exact set of top-level path segments that live in the (app) route
// group (src/app/(app)/...) — account, admin, billing, etc. These never get
// a locale prefix or a proxy rewrite; interface language for this shell is
// a stored preference, not a URL segment (see the multilingual rollout
// plan). Every folder under src/app/(app)/ must have its top segment listed
// here, or proxy.ts will incorrectly try to rewrite it into the [locale]
// content tree.
export const APP_SHELL_TOP_LEVEL_SEGMENTS = new Set([
  "account",
  "admin",
  "api",
  "pricing",
  "ai-assistant",
  "history",
  "contact",
  "privacy",
  "terms",
  "refund",
  "faq",
  "affiliate-disclosure",
  "repair-pdfs",
  "videos",
  "diagnostics",
]);
