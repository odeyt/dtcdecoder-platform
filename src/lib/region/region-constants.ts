// Client-safe constant, split out of region-server.ts (which is
// "server-only" and pulls in Supabase admin/cookies/headers) so client
// components like RegionGeoBanner.tsx can read the cookie name without
// dragging server-only code into the client bundle — the exact same split
// this codebase already uses for APP_LOCALE_COOKIE_NAME (see
// app-shell-locale-constants.ts vs app-shell-locale.ts).
export const REGION_PREFERENCE_COOKIE_NAME = "dtc_region_preference";
