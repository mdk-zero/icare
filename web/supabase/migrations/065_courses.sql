-- =================================================================
-- 065: Courses, terms and semester requirements.
--
-- A Dean keeps their own list of academic terms ("1st Semester AY
-- 2026–2027", with start and end dates) and courses ("NCM 103 Health
-- Assessment"), and assigns a course to one of their instructors for one
-- or more sections within a term (course_offerings). Like faculty (053),
-- terms and courses belong to the Dean who made them (admin_id), so one
-- Dean editing a term never moves another Dean's grading window.
--
-- Each course covers part of the Taylor's skills catalog (045). The list
-- is shared by every instructor teaching the course (course_skills).
--
-- The instructor of an offering writes its requirements checklist: what
-- their students in the offering's sections must accomplish this term.
-- An item is one of:
--   activity  one Patient Case, Quiz or Case Presentation, done once graded
--   count     N graded Patient Cases / Quizzes / Case Presentations, or
--             N shifts attended
--   skill     graded work covering one catalog skill
--   manual    free text the instructor ticks by hand
-- Only work graded inside the term's dates counts. Progress on the
-- automatic kinds is computed from the graded work when read, so the only
-- stored progress is course_requirement_checks: ticks on manual items,
-- and an instructor's "mark done" on an automatic item (with a note).
--
-- Everything goes through the service role in the API routes, which check
-- the caller's role and ownership themselves, so RLS is on with no
-- policies.
-- =================================================================

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.users(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_terms_window_ck check (ends_on >= starts_on)
);

create unique index if not exists academic_terms_admin_name_uq
  on public.academic_terms (admin_id, lower(btrim(name)));

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.users(id) on delete set null,
  code text not null check (char_length(btrim(code)) between 1 and 20),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists courses_admin_code_uq
  on public.courses (admin_id, lower(btrim(code)));

create table if not exists public.course_skills (
  course_id uuid not null references public.courses(id) on delete cascade,
  skill_id text not null references public.taylor_skills(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  added_by uuid references public.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (course_id, skill_id)
);

-- One instructor teaching one course in one term. faculty_id is set null
-- when the account goes, so the checklist survives until the Dean
-- reassigns it.
create table if not exists public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  term_id uuid not null references public.academic_terms(id) on delete cascade,
  faculty_id uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (course_id, term_id, faculty_id)
);

create index if not exists idx_course_offerings_faculty on public.course_offerings (faculty_id);
create index if not exists idx_course_offerings_term on public.course_offerings (term_id);

create table if not exists public.course_offering_sections (
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  primary key (offering_id, section_id)
);

create index if not exists idx_course_offering_sections_section
  on public.course_offering_sections (section_id);

-- The linked activity is set null, not cascaded, when it is deleted: the
-- item stays on the checklist as "Removed activity" instead of vanishing.
-- The API requires the link when an activity item is created.
create table if not exists public.course_requirements (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  position int not null default 0,
  kind text not null check (kind in ('activity', 'count', 'skill', 'manual')),
  title text not null default '' check (char_length(title) <= 200),
  activity_type text check (activity_type in ('scenario', 'assessment', 'case_presentation', 'shift')),
  scenario_id uuid references public.scenarios(id) on delete set null,
  assessment_id uuid references public.assessments(id) on delete set null,
  presentation_id uuid references public.case_presentations(id) on delete set null,
  target_count int check (target_count between 1 and 200),
  skill_id text references public.taylor_skills(id) on delete cascade,
  -- null: graded is enough.
  min_score numeric(5, 2) check (min_score between 0 and 100),
  -- count items: only cases and quizzes covering one of the course's skills.
  skills_only boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_requirements_shape_ck check (
    (kind = 'activity'
      and activity_type in ('scenario', 'assessment', 'case_presentation')
      and target_count is null and skill_id is null and not skills_only
      and num_nonnulls(scenario_id, assessment_id, presentation_id) <= 1
      and (scenario_id is null or activity_type = 'scenario')
      and (assessment_id is null or activity_type = 'assessment')
      and (presentation_id is null or activity_type = 'case_presentation'))
    or (kind = 'count'
      and activity_type is not null and target_count is not null
      and num_nonnulls(scenario_id, assessment_id, presentation_id, skill_id) = 0
      and (activity_type <> 'shift' or min_score is null)
      and (not skills_only or activity_type in ('scenario', 'assessment')))
    or (kind = 'skill'
      and skill_id is not null and activity_type is null and target_count is null
      and not skills_only
      and num_nonnulls(scenario_id, assessment_id, presentation_id) = 0)
    or (kind = 'manual'
      and char_length(btrim(title)) > 0 and activity_type is null
      and target_count is null and min_score is null and not skills_only
      and num_nonnulls(scenario_id, assessment_id, presentation_id, skill_id) = 0)
  )
);

create index if not exists idx_course_requirements_offering
  on public.course_requirements (offering_id, position);

create table if not exists public.course_requirement_checks (
  requirement_id uuid not null references public.course_requirements(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  checked_by uuid references public.users(id) on delete set null,
  checked_at timestamptz not null default now(),
  note text not null default '' check (char_length(note) <= 500),
  primary key (requirement_id, student_id)
);

create index if not exists idx_course_requirement_checks_student
  on public.course_requirement_checks (student_id);

drop trigger if exists trg_academic_terms_updated_at on public.academic_terms;
create trigger trg_academic_terms_updated_at
  before update on public.academic_terms
  for each row execute function public.set_updated_at();

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

drop trigger if exists trg_course_requirements_updated_at on public.course_requirements;
create trigger trg_course_requirements_updated_at
  before update on public.course_requirements
  for each row execute function public.set_updated_at();

alter table public.academic_terms enable row level security;
alter table public.courses enable row level security;
alter table public.course_skills enable row level security;
alter table public.course_offerings enable row level security;
alter table public.course_offering_sections enable row level security;
alter table public.course_requirements enable row level security;
alter table public.course_requirement_checks enable row level security;
