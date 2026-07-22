// Every top-level route folder under src/app that has (or could have) a
// `/x/[y]` child route. A `dtc_codes.make` value equal to one of these would
// silently resolve to that static route's own dynamic child instead of the
// intended `/[make]/[slug]` make page — e.g. a make named "blog" at
// "/blog/p0420" would hit the blog-post route, not the make page. Enforced
// in the admin create/edit action, not just documented.
export const RESERVED_TOP_LEVEL_SLUGS = [
  "dtc",
  "blog",
  "admin",
  "account",
  "api",
  "pricing",
  "contact",
  "ai-assistant",
  "videos",
  "repair-pdfs",
  "checkout",
];

export function isReservedMakeSlug(make: string): boolean {
  return RESERVED_TOP_LEVEL_SLUGS.includes(make.toLowerCase().trim());
}
