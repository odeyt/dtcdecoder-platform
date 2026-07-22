-- DTC Decoder platform rebuild: DTC lookup, blog, subscriptions, AI settings.
-- The old products/product_files/orders/order_items tables from 0001_init.sql
-- are intentionally left untouched (dormant, unused) rather than dropped —
-- avoids destructive DDL on a real database without a separate explicit step.

create type dtc_difficulty as enum ('easy', 'moderate', 'hard', 'professional');

create type blog_category as enum (
  'dtc_guides', 'check_engine_light', 'limp_mode', 'can_bus_diagnostics',
  'ev_diagnostics', 'transmission_faults', 'immobilizer_problems',
  'bmw_diagnostics', 'land_rover_diagnostics', 'toyota_diagnostics'
);

create type subscription_plan as enum ('free', 'pro', 'workshop');
create type subscription_status as enum ('active', 'past_due', 'canceled');

create table dtc_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  make text,
  model text,
  engine_code text,
  slug text not null,
  title text not null,
  meta_description text,
  meaning text not null,
  symptoms text[] not null default '{}',
  causes text[] not null default '{}',
  diagnostic_steps text[] not null default '{}',
  common_mistakes text,
  difficulty dtc_difficulty not null default 'moderate',
  related_makes text[] not null default '{}',
  faq jsonb not null default '[]',
  pdf_url text,
  youtube_url text,
  search_count int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two partial unique indexes, not a single global-unique slug — a generic
-- "/dtc/p2263" and a make page "/land-rover/p2263" must both be able to use
-- slug "p2263" at once. Postgres treats NULL as distinct in a plain
-- UNIQUE(make, slug), so generic rows need their own index.
create unique index dtc_generic_slug on dtc_codes (slug) where make is null;
create unique index dtc_make_slug on dtc_codes (make, slug) where make is not null;
create index dtc_codes_published_idx on dtc_codes (is_published);
create index dtc_codes_search_count_idx on dtc_codes (search_count desc);

-- Full-text search fallback for code-less symptom queries (both the public
-- search bar and the AI assistant's grounding retrieval — e.g. "rough idle",
-- "limp mode" with no P-code mentioned). A real generated column, not just
-- an expression index, so the Supabase client's .textSearch("fts", ...)
-- helper can reference it by name.
alter table dtc_codes add column fts tsvector
  generated always as (
    to_tsvector(
      'english',
      title || ' ' || meaning || ' ' ||
      array_to_string(symptoms, ' ') || ' ' || array_to_string(causes, ' ')
    )
  ) stored;

create index dtc_codes_fts_idx on dtc_codes using gin (fts);

-- Atomic increment for search-popularity tracking (admin "top searched
-- codes" view) — avoids a read-then-write race under concurrent traffic.
create or replace function increment_dtc_search_count(dtc_id uuid)
returns void as $$
begin
  update dtc_codes set search_count = search_count + 1 where id = dtc_id;
end;
$$ language plpgsql security definer;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger dtc_codes_set_updated_at
before update on dtc_codes
for each row execute function set_updated_at();

create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  category blog_category not null,
  excerpt text,
  content text not null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index blog_posts_category_idx on blog_posts (category);
create index blog_posts_published_idx on blog_posts (is_published);

create trigger blog_posts_set_updated_at
before update on blog_posts
for each row execute function set_updated_at();

create table email_signups (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  plan subscription_plan not null default 'free',
  status subscription_status not null default 'active',
  creem_subscription_id text unique,
  creem_customer_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on subscriptions (user_id);
create index subscriptions_email_idx on subscriptions (email);

create trigger subscriptions_set_updated_at
before update on subscriptions
for each row execute function set_updated_at();

create table admin_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default current_date,
  query_count int not null default 1,
  primary key (user_id, usage_date)
);

-- Atomic per-user daily counter for the AI assistant's rate limit — a plain
-- upsert can't express "increment the existing value," so this uses
-- ON CONFLICT DO UPDATE with a computed increment and returns the new count
-- in one round trip (no read-then-write race).
create or replace function increment_ai_usage(p_user_id uuid)
returns int as $$
declare
  new_count int;
begin
  insert into ai_usage (user_id, usage_date, query_count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date)
  do update set query_count = ai_usage.query_count + 1
  returning query_count into new_count;

  return new_count;
end;
$$ language plpgsql security definer;

-- Row Level Security. Namespaced policy names (dtc_codes_*, blog_posts_*) to
-- avoid collision with the old, still-present policies from 0001_init.sql.
alter table dtc_codes enable row level security;
alter table blog_posts enable row level security;
alter table email_signups enable row level security;
alter table subscriptions enable row level security;
alter table admin_settings enable row level security;
alter table ai_usage enable row level security;

create policy dtc_codes_public_read on dtc_codes
  for select
  using (is_published = true);

create policy blog_posts_public_read on blog_posts
  for select
  using (is_published = true);

-- email_signups, subscriptions, admin_settings, ai_usage: no policy at all —
-- every access goes through the service-role client (matches the old
-- product_files_no_direct_read "block entirely" pattern from 0001_init.sql).
