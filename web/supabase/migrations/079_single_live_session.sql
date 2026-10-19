-- =================================================================
-- 079: one live session per account on each platform.
--
-- Every sign-in mints a session id and stores it here, in the slot for
-- the platform it came from: the web portal or the mobile app. A token
-- carrying any other id for that platform is refused, so the newest
-- sign-in wins and the one before it is signed out at its next request.
-- The web and the app keep separate slots, so an instructor can use
-- both at once.
--
-- Null means no sign-in since this migration; tokens issued before it
-- carry no id and keep working until the account signs in again.
-- =================================================================

alter table public.users
  add column if not exists web_session_id uuid,
  add column if not exists mobile_session_id uuid;
