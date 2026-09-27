-- =================================================================
-- 059: Auth hardening.
--
-- password_resets.attempts caps guessing at a reset code, the same way
-- email_change_requests.attempts already does (058). Five wrong codes
-- spend the code.
--
-- users.sessions_valid_after revokes sessions. Sessions are stateless
-- 7-day JWTs; readSession() now re-reads the user row and rejects any
-- token issued before this timestamp. It is bumped on a password change
-- or reset and on a role change. Null means no cutoff.
--
-- rate_limits + consume_rate_limit() give one rate limiter shared by
-- every server instance. The old in-memory Map counted per instance, so
-- on Vercel a client spread across instances saw a fresh count on each.
-- The app falls back to that Map until this migration is applied.
-- =================================================================

alter table public.password_resets
  add column if not exists attempts int not null default 0;

alter table public.users
  add column if not exists sessions_valid_after timestamptz;

create table if not exists public.rate_limits (
  key text primary key,
  count int not null,
  reset_at timestamptz not null
);

-- Only the service-role API touches this table.
alter table public.rate_limits enable row level security;

comment on table public.rate_limits is
  'Fixed-window rate limit counters, shared across server instances. Service-role only.';

-- True if this request is within the limit (and counts it); false once
-- p_max requests have been made in the current window. One atomic upsert,
-- so concurrent requests cannot both slip under the limit.
create or replace function public.consume_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case when r.reset_at <= now() then 1 else r.count + 1 end,
        reset_at = case when r.reset_at <= now()
                        then now() + make_interval(secs => p_window_seconds)
                        else r.reset_at end
  returning count into v_count;

  -- Keep the table small: drop a batch of long-expired windows.
  delete from public.rate_limits
  where key in (
    select key from public.rate_limits
    where reset_at < now() - interval '1 day'
    limit 100
  );

  return v_count <= p_max;
end;
$$;

revoke all on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, int, int) to service_role;
