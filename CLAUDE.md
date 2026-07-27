# DTCDecoder — Claude Code Operating Context

@AGENTS.md

## Project

**DTCDecoder** — Next.js App Router + TypeScript + Supabase platform selling digital automotive products (wiring diagrams, automotive software/tools) as paid one-time downloads.

- **Production (future):** dtcdecoder.com
- **Repo:** `C:\Users\wallyd1\DTC DECODER`
- **Sibling projects on this machine:** Sapelee (`AI-FOUNDER-CLOUD`), Redlined1 (`REDLINE`) — DTCDecoder is standalone and does not integrate with either. Do not add cross-repo dependencies or event hooks without explicit instruction.

## Hard Constraints

1. **Next.js 16 breaking changes**: this project was scaffolded with Next.js 16.2.10, which is newer than most training data. `middleware.ts` is renamed to `proxy.ts` (exported function `proxy`, not `middleware`). Route/page `params` are always a `Promise` — must `await`. Check `node_modules/next/dist/docs/` before using an API you're not certain about.
2. **No secrets in source.** No API keys, tokens, or credentials in committed code. All secrets via env vars, `.env.local` (gitignored).
3. **Guest checkout stays email-only; account password login now exists.** Buyers still check out with email only — no password is ever required to purchase. Account *sign-in* originally supported magic-link (OTP) only; password sign-in plus a forgot/reset-password flow were added by explicit owner instruction (2026-07-27) and now coexist with magic-link as an alternative, not a replacement. See `docs/deployment/supabase-auth-setup.md`.
4. **Private files stay private.** Purchased files live in the private `product-files` Supabase Storage bucket. Never add a public-read policy to that bucket. Downloads are only ever served via short-lived `createSignedUrl()` calls from a server route, after verifying the requesting user purchased that item.
5. **Payment provider is Creem.io, one-time checkout mode** — not subscriptions. Do not port subscription/entitlement logic from Redlined1's Creem integration; only the signature-verification pattern is shared.
6. **Feature flags default off** for anything not fully wired up.
7. **No destructive SQL on any real database** without explicit approval and a tested rollback.

## Development Workflow

### Before every commit
```
1. npx tsc --noEmit          # TypeScript must pass clean
2. npm run build             # Build must succeed
3. Run relevant tests when available
4. git diff --stat           # review changed files
```

### Push policy
- Do NOT push to a remote automatically — none is configured yet.
- Commit locally only when explicitly asked.

### Windows environment
- Windows 11 machine. PowerShell for bulk operations; Git Bash for simple git/POSIX commands.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 App Router |
| Language | TypeScript (strict mode) |
| Database/Auth/Storage | Supabase |
| Payments | Creem.io (one-time checkout) |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel (not yet connected) |
