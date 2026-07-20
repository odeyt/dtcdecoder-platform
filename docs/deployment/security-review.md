# Production security review

Resolved: **high** unrestricted uploads (server MIME/count/size limits and safe filenames); **high** billing startup coupling (safe disabled state); **medium** request-origin callback redirects (configured site URL); **medium** ignored environment template; **low** non-unique storage paths.

Verified in code: server-only service role, server-side normalized admin allowlist and mutation rechecks, RLS migrations, private paid storage, five-minute signed URLs after paid owner checks, raw-body timing-safe webhook HMAC, idempotent completion, no success-query ownership grant, Zod checkout validation, and parameterized Supabase queries.

Remaining: **medium** no distributed rate limits; configure Vercel/WAF limits before billing. **Medium** npm reported two moderate advisories but registry detail was unavailable; review online without `--force`. **Medium** MIME is browser-provided; add file-signature/malware scanning before accepting untrusted uploaders/executables. **Low** no automated tests. **Low** configure log retention/redaction.

No unresolved critical/high local-code finding remains. Production controls require real Supabase, Vercel, and bundle verification.

