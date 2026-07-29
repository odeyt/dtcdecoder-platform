# Production Smoke Testing

## What it covers

`tests/e2e/smoke/*` run against `https://dtcdecoder.com` with
`PLAYWRIGHT_TARGET=production-smoke`: landing page, P0420 DTC lookup,
pricing, login form rendering, and (via `tests/e2e/security/`) the
anonymous Diagnostic Engine 401 boundary. **Anonymous/public only — no
authenticated session, no real provider call, no case creation.**

## Running it

```bash
npm run test:e2e:smoke:prod
```

Equivalent to:

```bash
cross-env PLAYWRIGHT_TARGET=production-smoke playwright test tests/e2e/smoke
```

## When to run it

- After confirming a new production deployment is live (manually, or via
  `workflow_dispatch` on `.github/workflows/playwright.yml` with
  `run_production_smoke: true`).
- Before/after any Diagnostic Engine rollout-tier or module-flag change,
  as a fast regression check that public flows are unaffected.

## Safety

- Never creates a diagnostic case, never calls the provider, never signs
  in.
- If a smoke test ever needs to assert something that would require
  authentication or a real case, that assertion belongs in
  `internal-owner/` (gated) or a mocked test instead — do not weaken this
  suite's anonymous-only guarantee to make a new assertion fit.
