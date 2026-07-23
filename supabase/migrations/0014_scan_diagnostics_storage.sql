-- Private bucket for uploaded diagnostic scan report files. No select/
-- insert/update/delete policy is granted to anon or authenticated roles —
-- every read is a createSignedUrl() call from the service-role client
-- (src/lib/scan-diagnostics/storage.ts), issued only after verifying the
-- requesting user owns the case the file belongs to. Matches the
-- product-files bucket pattern in 0002_storage_buckets.sql exactly.
insert into storage.buckets (id, name, public)
values ('diagnostic-scan-files', 'diagnostic-scan-files', false)
on conflict (id) do nothing;
