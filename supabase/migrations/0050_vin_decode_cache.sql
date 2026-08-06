-- Permanent cache of NHTSA vPIC DecodeVinValues results, keyed by VIN. A VIN
-- identifies a fixed vehicle for life -- unlike dtc_code_localizations there
-- is no TTL/updated_at pattern here, matching how every other cache-shaped
-- table in this codebase treats immutable-identity data. Caches BOTH clean
-- decodes (is_valid = true) and known-bad VINs (is_valid = false, e.g. bad
-- check digit or unregistered manufacturer) so a repeated garbage VIN never
-- re-hits NHTSA. Written only by decodeVin() (src/lib/vin/decode.ts) via the
-- service-role admin client -- not user-owned, browser-served content like
-- dtc_code_localizations, so RLS is enabled with zero policies (deny-by-
-- default for anon/authenticated roles), matching terminology_glossary's
-- server-only posture.

create table if not exists vin_decode_cache (
  id uuid primary key default gen_random_uuid(),
  vin text not null,
  is_valid boolean not null default false,
  year text,
  make text,
  model text,
  trim text,
  engine_cylinders text,
  displacement_l text,
  error_code text not null,
  error_text text,
  raw_response jsonb not null,
  created_at timestamptz not null default now(),
  unique (vin)
);

create index if not exists vin_decode_cache_vin_idx on vin_decode_cache (vin);

alter table vin_decode_cache enable row level security;
-- No policies: service-role (admin) client bypasses RLS; anon/authenticated
-- roles get zero direct access.
