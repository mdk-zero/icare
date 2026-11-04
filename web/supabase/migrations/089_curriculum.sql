-- =================================================================
-- 089: The curriculum.
--
-- A Dean keeps their program of study here: every course by year level and
-- term, with its units, pre-requisites and co-requisites. It can start from an
-- uploaded PDF, which the app reads with AI and then saves as a curriculum that
-- is not in use, for a person to check. A Program Chair works on their Dean's
-- curriculum (users.admin_id, 087); admin_id here is always that Dean, so run
-- 087 first or a Program Chair's work is filed under their own account.
--
-- At most one curriculum per Dean is in use. Its laboratory courses (codes
-- ending in L) are what Assign Course offers; with none, the page falls back to
-- its built-in list. Nothing else reads these tables, and `courses` (065) keeps
-- its own rows, so deleting or replacing a curriculum never touches
-- assignments, checklists or grades.
--
-- Everything goes through the service role in the API routes, which check the
-- caller's role and ownership themselves, so RLS is on with no policies.
--
-- Every step is safe to re-run. Until it runs, the page says it needs 089 and
-- Assign Course keeps the built-in list.
-- =================================================================

create table if not exists public.curricula (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 150),
  is_active boolean not null default false,
  -- The uploaded PDF, kept to check the reading against.
  source_name text,
  source_path text,
  -- What the reading reported: the totals the PDF printed for each term, so
  -- they can be compared with the courses as they are edited, and its notes.
  analysis jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists curricula_one_active_uq
  on public.curricula (admin_id) where is_active;

create index if not exists curricula_admin_idx
  on public.curricula (admin_id, created_at desc);

create table if not exists public.curriculum_courses (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 50),
  title text not null check (char_length(btrim(title)) between 1 and 1000),
  year_level smallint not null check (year_level between 1 and 6),
  -- 1 first semester, 2 second semester, 3 midyear.
  term smallint not null check (term between 1 and 3),
  lecture_units numeric(4, 1) not null default 0 check (lecture_units between 0 and 99),
  -- Laboratory, skills lab, RLE and clinical units.
  lab_units numeric(4, 1) not null default 0 check (lab_units between 0 and 99),
  -- A requirement that isn't another course here, such as "3rd Year Standing".
  requisite_note text not null default '' check (char_length(requisite_note) <= 300),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists curriculum_courses_code_uq
  on public.curriculum_courses (curriculum_id, lower(btrim(code)));

create index if not exists curriculum_courses_order_idx
  on public.curriculum_courses (curriculum_id, year_level, term, position);

-- course_id needs requires_id: passed before it ('pre') or taken with it
-- ('co'). A co-requisite goes both ways, so it is stored as a row each way.
create table if not exists public.curriculum_requisites (
  course_id uuid not null references public.curriculum_courses(id) on delete cascade,
  requires_id uuid not null references public.curriculum_courses(id) on delete cascade,
  kind text not null check (kind in ('pre', 'co')),
  primary key (course_id, requires_id),
  constraint curriculum_requisites_not_self_ck check (course_id <> requires_id)
);

create index if not exists curriculum_requisites_requires_idx
  on public.curriculum_requisites (requires_id);

alter table public.curricula enable row level security;
alter table public.curriculum_courses enable row level security;
alter table public.curriculum_requisites enable row level security;

-- Private, like the library's: the page opens a PDF through a short-lived
-- signed link. 20 MB matches CURRICULUM_LIMITS.fileBytes in app/lib/curriculum.ts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curricula', 'curricula', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];
