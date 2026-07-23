-- Static, admin-managed exchange rates for DISPLAY ESTIMATES only — no
-- live FX fetching, no automated rate updates, per the agreed scope. USD
-- remains the canonical base price everywhere; actual checkout/billing
-- stays USD (Creem settles in USD) regardless of what a user sees
-- displayed. A missing or expired rate always falls back to showing USD
-- rather than a stale/wrong estimate.
create table currency_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null default 'USD' references currencies (code),
  quote_currency text not null references currencies (code),
  rate numeric(20, 8) not null check (rate > 0),
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  source_label text not null default 'admin-entered',
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (base_currency, quote_currency)
);

create index currency_rates_lookup_idx on currency_rates (base_currency, quote_currency, enabled);

create trigger currency_rates_set_updated_at
before update on currency_rates
for each row execute function set_updated_at();

-- Public read (not sensitive — same reasoning as languages/currencies):
-- the account preferences and pricing pages need to show an estimate to
-- any user previewing a currency, not just ones who've already saved a
-- paid preference. Writes are service-role only, from the admin action
-- (admin changes are visible via updated_by + updated_at — no separate
-- audit table for this v1; see docs/LOCALIZATION_OPERATIONS.md).
alter table currency_rates enable row level security;
create policy currency_rates_public_read on currency_rates for select using (true);
