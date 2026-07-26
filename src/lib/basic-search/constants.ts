// Shared between src/proxy.ts (mints the cookie) and any Server Component
// that needs to read it (e.g. src/app/[locale]/dtc/page.tsx) — kept
// separate from proxy.ts itself so page code doesn't need to import the
// middleware/proxy module just for this one constant.
export const ANON_SEARCH_ID_COOKIE = "dtc_anon_id";
