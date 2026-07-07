-- =================================================================
-- 009: Assessment core (DFD Process 5.0, ERD Assessment cluster)
--
-- competency_areas .. the 11 Philippine BON core nursing competencies
-- assessments ....... quizzes / question sets (Fig. 9 "Assessment")
-- questions ......... items with options, tagged per competency
-- assessment_assignments ... faculty assigns an assessment to a student
-- assessment_attempts / attempt_answers ... per-answer records; these
--   are the primary feature source for the ML performance predictor
--   (Objective 2.1) and the content-based recommender (Objective 2.2).
-- =================================================================

create table if not exists public.competency_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.competency_areas enable row level security;

drop policy if exists "authenticated users can read competency areas" on public.competency_areas;

create policy "authenticated users can read competency areas" on public.competency_areas
  for select using (true);

insert into public.competency_areas (name, description) values
  ('Safe and Quality Nursing Care', 'Provides safe, appropriate, and holistic care using the nursing process'),
  ('Management of Resources and Environment', 'Organizes workload, resources, and a safe care environment'),
  ('Health Education', 'Assesses learning needs and implements health education plans'),
  ('Legal Responsibility', 'Adheres to legal requirements in nursing practice'),
  ('Ethico-moral Responsibility', 'Applies ethical principles and the nursing code of ethics'),
  ('Personal and Professional Development', 'Pursues continuing education and professional growth'),
  ('Quality Improvement', 'Uses data to improve quality of care and patient outcomes'),
  ('Research', 'Applies evidence-based practice and research findings'),
  ('Records Management', 'Documents care accurately and maintains patient records'),
  ('Communication', 'Communicates effectively with patients, families, and the health team'),
  ('Collaboration and Teamwork', 'Works effectively within inter- and intra-professional teams')
on conflict (name) do nothing;

-- -----------------------------------------------------------------

do $$ begin
  create type assessment_difficulty as enum ('beginner', 'intermediate', 'advanced');
exception when duplicate_object then null; end $$;

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  title text not null,
  description text not null default '',
  difficulty assessment_difficulty not null default 'beginner',
  category scenario_category not null default 'General',
  time_limit_seconds int check (time_limit_seconds is null or time_limit_seconds > 0),
  is_published boolean not null default false,
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assessments_created_by on public.assessments(created_by);
create index if not exists idx_assessments_difficulty on public.assessments(difficulty);
create index if not exists idx_assessments_is_published on public.assessments(is_published);

alter table public.assessments enable row level security;

drop policy if exists "students read published assessments" on public.assessments;

create policy "students read published assessments" on public.assessments
  for select using (
    is_published or exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop policy if exists "faculty and admin manage assessments" on public.assessments;

create policy "faculty and admin manage assessments" on public.assessments
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_assessments_updated_at on public.assessments;
create trigger trg_assessments_updated_at
  before update on public.assessments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  position int not null default 0,
  content text not null,
  options jsonb not null default '[]'::jsonb,   -- array of option strings
  correct_index int not null check (correct_index >= 0),
  explanation text not null default '',
  difficulty assessment_difficulty,             -- optional per-item override
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_questions_assessment_id on public.questions(assessment_id);

alter table public.questions enable row level security;

-- Note: correct_index/explanation exposure to students is controlled at the
-- API layer (server uses the service role); this policy is defense-in-depth.
drop policy if exists "authenticated users can read questions" on public.questions;
create policy "authenticated users can read questions" on public.questions
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('student', 'faculty', 'admin')
    )
  );

drop policy if exists "faculty and admin manage questions" on public.questions;

create policy "faculty and admin manage questions" on public.questions
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_questions_updated_at on public.questions;
create trigger trg_questions_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

-- Many-to-many: question <-> competency area
create table if not exists public.question_competencies (
  question_id uuid not null references public.questions(id) on delete cascade,
  competency_id uuid not null references public.competency_areas(id) on delete cascade,
  primary key (question_id, competency_id)
);

create index if not exists idx_question_competencies_competency
  on public.question_competencies(competency_id);

alter table public.question_competencies enable row level security;

drop policy if exists "authenticated users can read question competencies" on public.question_competencies;

create policy "authenticated users can read question competencies" on public.question_competencies
  for select using (true);

-- -----------------------------------------------------------------

do $$ begin
  create type assessment_assignment_status as enum ('pending', 'in_progress', 'completed', 'overdue');
exception when duplicate_object then null; end $$;

create table if not exists public.assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  deadline timestamptz,
  status assessment_assignment_status not null default 'pending',
  required boolean not null default true,
  unique (assessment_id, student_id)
);

create index if not exists idx_assessment_assignments_student
  on public.assessment_assignments(student_id);
create index if not exists idx_assessment_assignments_assessment
  on public.assessment_assignments(assessment_id);
create index if not exists idx_assessment_assignments_status
  on public.assessment_assignments(status);

alter table public.assessment_assignments enable row level security;

drop policy if exists "students read own assessment assignments" on public.assessment_assignments;

create policy "students read own assessment assignments" on public.assessment_assignments
  for select using (auth.uid() = student_id);

drop policy if exists "faculty and admin manage assessment assignments" on public.assessment_assignments;

create policy "faculty and admin manage assessment assignments" on public.assessment_assignments
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------

do $$ begin
  create type attempt_status as enum ('in_progress', 'submitted', 'expired');
exception when duplicate_object then null; end $$;

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  assignment_id uuid references public.assessment_assignments(id) on delete set null,
  status attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(5,2) check (score is null or (score >= 0 and score <= 100)),
  time_taken_seconds int check (time_taken_seconds is null or time_taken_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_attempts_student
  on public.assessment_attempts(student_id, created_at desc);
create index if not exists idx_assessment_attempts_assessment
  on public.assessment_attempts(assessment_id);

alter table public.assessment_attempts enable row level security;

drop policy if exists "students read own attempts" on public.assessment_attempts;

create policy "students read own attempts" on public.assessment_attempts
  for select using (auth.uid() = student_id);

drop policy if exists "faculty and admin read attempts" on public.assessment_attempts;

create policy "faculty and admin read attempts" on public.assessment_attempts
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_index int,
  is_correct boolean not null default false,
  time_spent_seconds int check (time_spent_seconds is null or time_spent_seconds >= 0),
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists idx_attempt_answers_attempt on public.attempt_answers(attempt_id);
create index if not exists idx_attempt_answers_question on public.attempt_answers(question_id);

alter table public.attempt_answers enable row level security;

drop policy if exists "students read own attempt answers" on public.attempt_answers;

create policy "students read own attempt answers" on public.attempt_answers
  for select using (
    exists (
      select 1 from public.assessment_attempts a
      where a.id = attempt_id and a.student_id = auth.uid()
    )
  );

drop policy if exists "faculty and admin read attempt answers" on public.attempt_answers;

create policy "faculty and admin read attempt answers" on public.attempt_answers
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );
