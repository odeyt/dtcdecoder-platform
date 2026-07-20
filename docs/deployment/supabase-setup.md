# Supabase setup

1. Create/confirm a project named `dtcdecoder` and record its reference.
2. From Project Settings > API, place the URL, publishable/anon key, and server-only service key in `.env.local`.
3. In SQL Editor, confirm the selected project, then run `0001_init.sql` followed by `0002_storage_buckets.sql`.
4. Verify all four tables have RLS enabled. Public users may read only published products; owners may read their orders/items; `product_files` must not be directly readable.
5. Verify `product-files` is private and `product-previews` is public.
6. In Authentication > URL Configuration set Site URL `https://dtcdecoder.com`. Add exact callbacks for localhost, the real preview, and production. Prefer exact paths over wildcards.
7. Sign in `thammo01@outlook.com` by magic link and configure it in server-only `ADMIN_ALLOWED_EMAILS`.
8. Test public reads, owner isolation, private storage, and five-minute signed downloads.

Migration checklist: confirm organization/project/reference/environment; back up production; review SQL; apply in numeric order once; record results; inspect RLS/buckets; run access tests. There are no destructive drops or broad grants. The CLI was unavailable, so nothing was linked/applied. Never run `db reset`; correct issues with a reviewed forward migration.

