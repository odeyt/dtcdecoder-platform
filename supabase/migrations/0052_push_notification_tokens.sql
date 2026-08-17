-- Device push tokens for the Capacitor native shell (Android now, iOS once
-- an iOS project exists — see docs/CAPACITOR_NATIVE_APP_READINESS_AUDIT.md).
-- Registered client-side by src/components/capacitor/PushNotifications.tsx
-- via @capacitor/push-notifications' "registration" event, written through
-- POST /api/account/push-tokens using the service-role client — this app
-- never grants direct client-side insert/update/delete RLS policies,
-- matching user_preferences (0006) and search_history (0005): owner-read
-- only, all writes go through a server route with the admin client.
--
-- One row per (user, device installation), not per user — the same user
-- can be signed into the app on multiple devices, each with its own FCM
-- token, and each device's install can also be reinstalled (new token,
-- same device) without a stable device identifier to key on. `token` is
-- unique on its own: FCM tokens are globally unique per app-install, so a
-- token can never legitimately belong to two rows at once, and upserting
-- on token (not on user_id+platform) correctly handles a token migrating
-- to a different (or now-signed-out-then-back-in) user without leaving
-- stale duplicate rows.
create table if not exists push_notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  token text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (token)
);

create index if not exists push_notification_tokens_user_id_idx
  on push_notification_tokens (user_id);

alter table push_notification_tokens enable row level security;
create policy push_notification_tokens_owner_read on push_notification_tokens
  for select using (auth.uid() = user_id);
