-- =================================================================
-- 066: Scores an instructor enters on a requirements checklist.
--
-- Where 065 let an instructor tick a manual item or "mark done" an
-- automatic one with a note, they now enter the score the student earned
-- on work the app has no grade for: a Lab Activity (manual item) like a
-- return demonstration, or a Quiz taken on paper. The score is judged the
-- way a grade would be:
--   activity, skill, manual  one score per student, which meets the item
--                            when it reaches the item's minimum
--   count                    each score is one more piece of work toward
--                            the count, and joins the average shown
-- Shift counts take no score; they keep 065's mark-done. Ticks and marks
-- already in course_requirement_checks still count.
--
-- Like the rest of 065, everything goes through the service role in the
-- API routes, so RLS is on with no policies.
-- =================================================================

create table if not exists public.course_requirement_scores (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.course_requirements(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  note text not null default '' check (char_length(note) <= 500),
  entered_by uuid references public.users(id) on delete set null,
  entered_at timestamptz not null default now()
);

create index if not exists idx_course_requirement_scores_item
  on public.course_requirement_scores (requirement_id, student_id);
create index if not exists idx_course_requirement_scores_student
  on public.course_requirement_scores (student_id);

alter table public.course_requirement_scores enable row level security;
