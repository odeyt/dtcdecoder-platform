# Supabase Verification

Project: `dtcdecoder` (org `d1group`, Project ID `sysbwmiguyxwzufwxwxpq`, region `ap-northeast-1`).

## Migration content audit

Reviewed [supabase/migrations/0001_init.sql](../../supabase/migrations/0001_init.sql) and [0002_storage_buckets.sql](../../supabase/migrations/0002_storage_buckets.sql) line by line against the checklist:

| Check | Finding |
|---|---|
| Destructive SQL | None — only `create table`, `create index`, `create trigger`, `create policy`, and idempotent bucket inserts. No `drop`/`truncate`/`delete`. |
| RLS enabled | Yes on all 4 tables (`products`, `product_files`, `orders`, `order_items`) — `alter table ... enable row level security` for each. |
| Public storage access | `product-files` bucket created with `public = false` (correct — paid content). `product-previews` created with `public = true` (intentional — marketing thumbnails only, never paid content). |
| Ownership policies | `orders_owner_read` and `order_items_owner_read` scope to `auth.uid() = user_id` (the latter via an `exists` join through `orders`). `product_files` has **no** select policy for anon/authenticated at all — reads are blocked entirely; the only path to a file is `createSignedUrl()` from the service-role client after the app-layer ownership check in `verifyPurchaseAndGetFile()`. |
| Admin policies | There are no RLS policies scoped to an "admin" role — by design. Admin writes go through the service-role client (bypasses RLS), gated by `requireAdmin()` in application code, not by RLS. This is a legitimate pattern here since the service key never reaches the browser, but it means **RLS is not the admin security boundary** — `src/lib/admin-auth.ts` is. Flagging for awareness, not as a defect. |
| Unsafe grants | None found — no explicit `grant` statements beyond Supabase's own role defaults. |
| Indexes | Present on the columns the app actually queries by: `products(category)`, `products(is_published)`, `product_files(product_id)`, `orders(user_id)`, `orders(email)`, `orders(status)`, `order_items(order_id)`, `order_items(product_id)`. No missing index found for any query in `src/lib/products.ts` / `orders.ts`. |
| Duplicate constraints | None found. |
| Idempotency | `0001_init.sql` is **not** idempotent (`create table` without `if not exists`) — cannot be safely re-run as-is; that's fine for a first migration but future migrations should either use `if not exists` guards or Supabase's migration-history tracking to avoid accidental re-runs. `0002_storage_buckets.sql`'s bucket inserts are idempotent (`on conflict (id) do nothing`), but its `create policy` statement is not (re-running would error "policy already exists"). |
| Service-role misuse | Reviewed every `createAdminClient()` call site (`admin.ts`, `orders.ts`, `storage.ts`, `admin-products.ts`) — each is either behind `requireAdmin()` or behind an explicit ownership/paid-status check before use. No route hands the admin client to unauthenticated or unauthorized callers. |

**Verdict: no critical or high-risk RLS/storage issues found.** No fixes applied because none were needed.

## Were the migrations actually applied?

Yes — verified two independent ways:

1. **Owner-confirmed dashboard run**: both migrations were executed directly in the Supabase SQL Editor against `main` (production) and returned `Success. No rows returned`.
2. **Independent live verification (this audit)**: local dev server was pointed at the real project (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local` resolve to this same project ref) and `/catalog` successfully queried the `products` table through the RLS-scoped anon client, returning an empty result set rather than a "relation does not exist" error. This independently confirms the `products` table exists and its RLS policy is active and functioning (a broken/missing policy would have errored, not returned empty).

CLI-based verification (`supabase db push` / direct psql inspection) was not available — the Supabase CLI is not authenticated in this environment (`npx supabase login` requires an interactive TTY or a personal access token, which was intentionally not routed through this session; see [current-state-audit.md](current-state-audit.md)).

## Manual verification queries (optional, for owner confidence)

Run in Supabase SQL Editor if you want to double-check directly:

```sql
-- Tables exist
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('products', 'product_files', 'orders', 'order_items');

-- RLS is enabled
select relname, relrowsecurity from pg_class
where relname in ('products', 'product_files', 'orders', 'order_items');

-- Storage buckets exist and product-files is private
select id, public from storage.buckets where id in ('product-files', 'product-previews');
```

Expected: 4 rows from the first query, `relrowsecurity = true` for all 4 in the second, and `product-files` → `public = false`, `product-previews` → `public = true` in the third.

## Not run

`supabase db reset`, any `drop`, or any destructive migration — none were needed and none were run, per the standing constraint against destructive database operations.
