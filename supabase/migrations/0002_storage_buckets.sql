-- Private bucket for purchased files. No select/insert/update/delete policy
-- is granted to anon or authenticated roles here on purpose: every read is
-- a createSignedUrl() call from the service-role client
-- (src/lib/supabase/admin.ts) issued only after verifying the requesting
-- user purchased that item (see src/app/api/downloads/[orderItemId]/route.ts).
insert into storage.buckets (id, name, public)
values ('product-files', 'product-files', false)
on conflict (id) do nothing;

-- Public bucket for marketing thumbnails/preview images — safe to be
-- world-readable since it never holds the paid content.
insert into storage.buckets (id, name, public)
values ('product-previews', 'product-previews', true)
on conflict (id) do nothing;

create policy product_previews_public_read on storage.objects
  for select
  using (bucket_id = 'product-previews');
