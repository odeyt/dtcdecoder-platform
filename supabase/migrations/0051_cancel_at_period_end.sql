-- Tracks a Creem "scheduled cancellation" (mode: "scheduled") — the
-- subscription stays entitled (status stays 'active') until
-- current_period_end, then Creem's subscription.canceled webhook flips
-- status to 'canceled'. Kept as a separate boolean rather than a fourth
-- subscription_status value (0003) because Creem's own 'scheduled_cancel'
-- status is not a distinct entitlement state for us — access is identical
-- to 'active' the whole time; this is purely an intent flag layered on top
-- of the existing 3-value enum. See src/app/api/webhooks/creem/route.ts's
-- subscription.scheduled_cancel case and src/lib/subscriptions.ts's
-- upsertSubscriptionFromWebhook.
alter table subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column subscriptions.cancel_at_period_end is
  'True when a Creem scheduled cancellation is pending: status stays active/entitled until current_period_end, then subscription.canceled flips status to canceled. Cleared by subscription.active/paid (resume/renewal) and by subscription.canceled (terminal).';
