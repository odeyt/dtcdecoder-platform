# Vercel setup

Import `odeyt/dtcdecoder-platform` into the confirmed team. Choose Next.js, repository root, install `npm install`, build `npm run build`, and no custom output directory. Select a Vercel-supported Node LTS.

Configure Development, Preview, and Production variables separately. Keep production credentials out of Preview and billing false until sandbox validation. Deploy Preview first; confirm team/project/repository before `vercel link` or deploy. No local filesystem writes or Windows runtime paths were found.

If needed: `npm install -g vercel`, `vercel login`, `vercel link`, `vercel`. Do not link until the displayed target is confirmed.

