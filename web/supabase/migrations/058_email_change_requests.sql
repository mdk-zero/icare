-- =================================================================
-- 058: Confirmed email changes.
--
-- An account's email can now be changed — by the account holder, by the
-- admin who owns a faculty account, or by a super admin; never a
-- student's. The change only lands once a 6-digit code sent to the NEW
-- address is entered, so nobody can point an account at an inbox that
-- doesn't exist or isn't theirs.
--
-- One row per request. The code is stored hashed, like password_resets.
-- requested_by is who asked: only the same session may confirm it, so an
-- admin can't finish a change a super admin started (or the reverse).
-- attempts caps guessing at the code; a request is spent (used_at) on
-- success, on too many wrong codes, or when a newer request replaces it.
-- =================================================================

create table if not exists public.email_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  new_email text not null check (new_email = lower(new_email) and new_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  otp_hash text not null,
  requested_by uuid references public.users(id) on delete set null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_change_requests_user_created
  on public.email_change_requests(user_id, created_at desc);

-- Only the service-role API touches this table; no client may read codes.
alter table public.email_change_requests enable row level security;

comment on table public.email_change_requests is
  'Pending email changes, confirmed by a code sent to the new address. Service-role only.';
