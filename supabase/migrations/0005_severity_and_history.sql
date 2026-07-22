-- Real backing data for the results redesign (severity + drive guidance) and
-- a genuine, persisted search history — both admin-editable / user-visible
-- capabilities actually implemented in code, not decorative placeholders.

alter table dtc_codes
  add column severity text not null default 'moderate'
    check (severity in ('low', 'moderate', 'high', 'critical'));

alter table dtc_codes
  add column drive_recommendation text;

create table search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('lookup', 'ai')),
  query text not null,
  dtc_code_id uuid references dtc_codes (id) on delete set null,
  created_at timestamptz not null default now()
);

create index search_history_user_id_idx on search_history (user_id, created_at desc);

alter table search_history enable row level security;

-- Users can read their own history directly; all writes go through the
-- service-role client from server routes (no insert/update/delete policy),
-- matching the pattern used elsewhere in this schema.
create policy search_history_owner_read on search_history
  for select
  using (auth.uid() = user_id);
