-- =================================================================
-- 011: Audit trail + notifications (manuscript F7, F8)
--
-- audit_logs is APPEND-ONLY: a trigger rejects UPDATE/DELETE so the
-- trail is unalterable (manuscript "Definition of Terms: Audit Trail").
-- =================================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  actor_role user_role,
  action text not null,              -- e.g. 'user.create', 'assessment.publish'
  entity_type text,                  -- e.g. 'assessment', 'patient'
  entity_id text,
  details jsonb not null default '{}'::jsonb,  -- before/after snapshots etc.
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_actor on public.audit_logs(actor_id, created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "admin can read audit logs" on public.audit_logs;

create policy "admin can read audit logs" on public.audit_logs
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role = 'admin'
    )
  );

create or replace function public.reject_audit_mutation()
returns trigger as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$ language plpgsql;

drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.reject_audit_mutation();

-- -----------------------------------------------------------------
-- Notifications (in-app feed; FCM delivery handled by the API layer)
-- -----------------------------------------------------------------

do $$ begin
  create type notification_type as enum (
    'assignment_created',
    'deadline_reminder',
    'at_risk_flag',
    'vitals_anomaly',
    'performance_validated',
    'assistance_request',
    'system'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type notification_type not null default 'system',
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,   -- deep-link payload
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "users read own notifications" on public.notifications;

create policy "users read own notifications" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "users update own notifications" on public.notifications;

create policy "users update own notifications" on public.notifications
  for update using (auth.uid() = user_id);

-- -----------------------------------------------------------------
-- Device tokens for Firebase Cloud Messaging (web + mobile)
-- -----------------------------------------------------------------

do $$ begin
  create type device_platform as enum ('web', 'android', 'ios');
exception when duplicate_object then null; end $$;

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform device_platform not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_device_tokens_user on public.device_tokens(user_id);

alter table public.device_tokens enable row level security;

drop policy if exists "users manage own device tokens" on public.device_tokens;

create policy "users manage own device tokens" on public.device_tokens
  for all using (auth.uid() = user_id);
