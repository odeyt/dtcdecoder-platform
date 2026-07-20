# GitHub setup

The repository has no remote and substantial user work. After reviewing the staged set:

```powershell
git branch -M main
git remote add origin https://github.com/odeyt/dtcdecoder-platform.git
git add .
git status
git commit -m "Prepare DTC Decoder for deployment"
git push -u origin main
```

First create/confirm the empty repository and authenticate. Verify `.env.local`, `.next`, `node_modules`, `.vercel`, logs, and secrets are absent while `.env.example` is staged. Never overwrite another remote or force-push.

