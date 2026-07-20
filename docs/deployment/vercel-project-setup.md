# Vercel Project Setup

## Status: already existed — verified and linked, not created fresh

The `dtcdecoder` Vercel project already existed under team `redlined1-s-projects` (account `thammo01-7973`), connected to `odeyt/dtcdecoder-platform` via GitHub integration, before this deployment pass began. No new project was created — per the standing rule against deploying to an unknown/unconfirmed project, this was verified (`vercel project ls`, `vercel whoami`) before any linkage.

- Local repo linked via `vercel link --yes --project dtcdecoder` (creates `.vercel/` locally, gitignored).
- Framework: Next.js (auto-detected).
- Build command: default (`next build` via `npm run build`).
- Node version: 24.x (Vercel default at project creation).
- GitHub integration: pushes to `main` deploy directly to **Production**; other branches/PRs deploy to **Preview**.

## If this project ever needs to be recreated from scratch

1. Vercel dashboard → **Add New Project**.
2. Import `odeyt/dtcdecoder-platform`.
3. Confirm framework preset: **Next.js**.
4. Confirm repository root (no monorepo subdirectory).
5. Configure environment variables (see [vercel-environment-setup.md](vercel-environment-setup.md)) before the first deploy if possible, or immediately after.
6. Deploy — first deploy targets Preview unless pushed directly to the production branch.
