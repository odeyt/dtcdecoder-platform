-- Extends user_preferences (created in migration 0006) with the region/
-- display fields the account preferences page needs — audited against the
-- existing table first; these three columns were genuinely missing, no
-- duplicate table or parallel schema created.
--
-- Also switches measurement_system's default from 'imperial' to 'metric':
-- this table has never been exposed to users before this slice (no
-- preferences UI existed until now), so no real row relies on the old
-- default — safe to correct rather than carry forward a US-centric default
-- for a global product.
alter table user_preferences
  add column region_code text,
  add column temperature_unit text not null default 'celsius'
    check (temperature_unit in ('celsius', 'fahrenheit')),
  add column time_format text not null default '24h'
    check (time_format in ('12h', '24h'));

alter table user_preferences
  alter column measurement_system set default 'metric';
