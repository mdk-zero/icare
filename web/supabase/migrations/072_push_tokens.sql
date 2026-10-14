-- =================================================================
-- 072: Push notifications to the mobile app.
--
-- The app's live feed only runs while it is open. To reach a phone that
-- is closed or in the background, each signed-in device registers its
-- Expo push token here, and every new notification row is also sent
-- through Expo's push service to that user's devices.
--
-- Sending happens in the database (pg_net, asynchronous), so every path
-- that creates a notification is covered without each one having to
-- remember to send a push. A failed send never fails the insert.
--
-- (Numbered 072: 071 is the instructor skill lists migration.)
-- Re-running is safe.
-- =================================================================

create extension if not exists pg_net;

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create or replace function public.send_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', new.title,
    'body', new.body,
    'sound', 'default',
    'priority', 'high',
    'channelId', 'live',
    'data', jsonb_build_object('notificationId', new.id)
  ))
  into messages
  from public.push_tokens t
  where t.user_id = new.user_id;

  if messages is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := messages,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  end if;
  return new;
exception when others then
  -- The notification is saved either way; the in-app feed still shows it.
  raise warning 'push send failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notifications_push on public.notifications;
create trigger trg_notifications_push
  after insert on public.notifications
  for each row execute function public.send_notification_push();
