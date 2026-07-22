import { isRecognizedLocaleCode } from "@/lib/i18n/locale-codes";
import { APP_SHELL_TOP_LEVEL_SEGMENTS } from "@/lib/i18n/app-shell-routes";

// Every top-level route folder under src/app that has (or could have) a
// `/x/[y]` child route. A `dtc_codes.make` value equal to one of these would
// silently resolve to that static route's own dynamic child instead of the
// intended `/[make]/[slug]` make page — e.g. a make named "blog" at
// "/blog/p0420" would hit the blog-post route, not the make page. Enforced
// in the admin create/edit action, not just documented. Built from the
// (app) route group's segment list (single source of truth, shared with
// proxy.ts) plus the content-tree special routes that aren't part of that
// group.
export const RESERVED_TOP_LEVEL_SLUGS = [
  ...APP_SHELL_TOP_LEVEL_SEGMENTS,
  "dtc",
  "blog",
  "checkout",
];

// `/[make]/[slug]` now lives nested under `/[locale]/`, so a make value
// equal to ANY recognized locale code (not just currently-enabled ones)
// would collide with the locale segment — e.g. a make "de" would silently
// become unreachable the moment German is later enabled in the registry,
// 404ing an already-indexed/bookmarked URL with no warning at activation
// time. Checked against the full static superset (src/lib/i18n/locale-
// codes.ts), not the DB's `enabled` flag, so this protection doesn't
// depend on which languages happen to be live today.
export function isReservedMakeSlug(make: string): boolean {
  const normalized = make.toLowerCase().trim();
  return RESERVED_TOP_LEVEL_SLUGS.includes(normalized) || isRecognizedLocaleCode(normalized);
}
