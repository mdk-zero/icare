-- =================================================================
-- 097: Essay questions, graded by the instructor.
--
-- An essay is a fourth question type next to multiple choice, true/false and
-- short answer. The student writes the answer; the instructor gives it points
-- out of the question's own `points`, with optional feedback. The other
-- questions on the paper are still checked when the student submits.
--
-- The answer waits in essay_answers until it is graded. Only then does it get
-- an attempt_answers row (is_correct when it earned at least 75%), so mastery,
-- the ML features and the reports never read an ungraded essay as wrong.
-- While any essay on an attempt is ungraded, the attempt is awaiting_grading:
-- its score counts those essays as 0 until they are graded.
-- =================================================================

alter table public.questions drop constraint if exists questions_question_type_check;
alter table public.questions
  add constraint questions_question_type_check
  check (question_type in ('multiple_choice', 'true_false', 'short_answer', 'essay'));

create table if not exists public.essay_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_text text not null default '' check (char_length(answer_text) <= 5000),
  -- The question's points when the student answered it.
  max_points integer not null check (max_points >= 1),
  -- Null until graded.
  points_awarded integer check (points_awarded >= 0 and points_awarded <= max_points),
  feedback text check (char_length(feedback) <= 2000),
  graded_by uuid references public.users(id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists idx_essay_answers_attempt on public.essay_answers(attempt_id);
create index if not exists idx_essay_answers_ungraded
  on public.essay_answers(attempt_id) where points_awarded is null;

alter table public.essay_answers enable row level security;

drop policy if exists "students read own essay answers" on public.essay_answers;
create policy "students read own essay answers" on public.essay_answers
  for select using (
    exists (
      select 1 from public.assessment_attempts a
      where a.id = attempt_id and a.student_id = auth.uid()
    )
  );

drop policy if exists "faculty and admin read essay answers" on public.essay_answers;
create policy "faculty and admin read essay answers" on public.essay_answers
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

alter table public.assessment_attempts
  add column if not exists awaiting_grading boolean not null default false;

create index if not exists idx_assessment_attempts_awaiting
  on public.assessment_attempts(assessment_id) where awaiting_grading;
