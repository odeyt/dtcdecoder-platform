// Shared open-redirect guard for every post-authentication "return to"
// parameter. Deliberately has no "server-only" marker: one caller is the
// client-side password login form, the other is the server auth callback,
// and both must apply the identical rule.
//
// Prefix matching on the raw string is NOT sufficient, which is why this
// resolves the candidate instead. The obvious guard —
//
//     next.startsWith("/") && !next.startsWith("//")
//
// accepts `/\evil.example`, because the WHATWG URL parser treats a
// backslash as equivalent to a forward slash in the authority position:
// `new URL("/\\evil.example", "https://dtcdecoder.com")` resolves to
// `https://evil.example/`. A freshly-authenticated user would be handed
// straight to an attacker-controlled host — the most valuable moment to
// phish someone, since they have just proven the login flow works.
//
// Resolving against the site origin and comparing `origin` closes that
// whole class of bypass at once (backslashes, encoded separators, and any
// future parser quirk) rather than blacklisting known payloads.
export function safeRedirectPath(
  next: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!next) return null;

  // Must be written as a site-relative path. Rejecting anything else up
  // front keeps absolute URLs out even when they name our own origin, so
  // the returned value is always a path callers can hand to router.push()
  // or resolve against the canonical site URL.
  if (!next.startsWith("/")) return null;

  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  let resolved: URL;
  try {
    resolved = new URL(next, base);
  } catch {
    return null;
  }

  if (resolved.origin !== base.origin) return null;

  // Return the re-serialized path rather than the caller's raw string, so
  // any separator the parser normalized cannot be reinterpreted downstream.
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;

  // Resolving is not enough on its own: `/..//evil.example` resolves to
  // this origin, but normalizes to the pathname `//evil.example`. Callers
  // re-resolve what they get back (`new URL(next, siteUrl)`, or
  // `router.push(next)`), at which point a leading `//` is protocol-relative
  // and points off-site again. Re-check the value actually being returned.
  if (new URL(path, base).origin !== base.origin) return null;

  return path;
}
