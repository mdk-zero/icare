-- =================================================================
-- 092: A student's permission to use the AI features.
--
-- A student's record goes to an outside AI provider only if the student said
-- yes. App Store Review Guideline 5.1.2(i) asks for explicit permission, and
-- the Privacy Policy promises it.
--
-- users.ai_consent: null has not answered, true allowed, false declined.
-- users.ai_consent_at: when they last answered.
--
-- Until this runs nobody has said yes, so AI study tips, AI feedback and AI
-- summaries of a student stay off, and the app doesn't ask. Grades, quizzes
-- and feedback worked out from the grades don't depend on it.
--
-- Nothing existing changes. Re-running is safe.
-- =================================================================

alter table public.users
  add column if not exists ai_consent boolean,
  add column if not exists ai_consent_at timestamptz;

comment on column public.users.ai_consent is
  'Permission to send this student''s record to the AI provider: null not asked yet, true allowed, false declined.';
