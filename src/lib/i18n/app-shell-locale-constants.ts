// Client-safe constants for the (app)-shell interface locale. Kept separate
// from app-shell-locale.ts because that module is "server-only" (it reads
// cookies()/Supabase), and the language switcher is a client component that
// needs the cookie name to set it in the browser.

// Anonymous/free "temporary" language switching, never persisted server-side
// — a saved account preference (Pro/Workshop only) always wins over this
// cookie when both exist.
export const APP_LOCALE_COOKIE_NAME = "dtc_interface_locale";
