-- Yearly billing option (subscriptions) and real token-based usage limits
-- on paid plans (ai_usage), so Pro/Workshop "unlimited" becomes a generous
-- but bounded monthly token allowance instead of truly uncapped API spend.

alter table subscriptions
  add column billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'yearly'));

alter table ai_usage
  add column tokens_used bigint not null default 0;

-- Free plan keeps its existing daily query-count gate (increment_ai_usage,
-- from 0003) — unchanged. Paid plans are checked against a rolling
-- calendar-month token budget instead: get_monthly_ai_tokens() reads the
-- month-to-date total (pre-flight, before the request), and
-- increment_ai_tokens() records the actual tokens consumed once the
-- Claude response completes (post-flight, since token count isn't known
-- until the response finishes streaming).

create or replace function get_monthly_ai_tokens(p_user_id uuid)
returns bigint as $$
  select coalesce(sum(tokens_used), 0)
  from ai_usage
  where user_id = p_user_id
    and usage_date >= date_trunc('month', current_date)::date;
$$ language sql stable security definer;

create or replace function increment_ai_tokens(p_user_id uuid, p_tokens bigint)
returns void as $$
begin
  insert into ai_usage (user_id, usage_date, query_count, tokens_used)
  values (p_user_id, current_date, 1, p_tokens)
  on conflict (user_id, usage_date)
  do update set
    tokens_used = ai_usage.tokens_used + p_tokens,
    query_count = ai_usage.query_count + 1;
end;
$$ language plpgsql security definer;
