# Rollback plan

Git: use `git log --oneline`, `git revert <commit>`, and a normal push; never reset shared history. Vercel: promote/redeploy the last verified stable deployment. Supabase: use a reviewed corrective forward migration or tested backup restoration, never automatic destructive reversal. DNS: preserve prior records and restore the last verified set if routing fails.

