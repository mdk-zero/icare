-- =================================================================
-- 094: Forms on a Return Demonstration.
--
-- An instructor may add forms to a Return Demonstration (072), such as an
-- IV fluid or TPR sheet, for the student to fill in alongside the skills
-- they demonstrate. Which forms exist, and their fields, is defined in the
-- app (app/lib/return-demo-forms.ts); the database keeps only their keys.
--
-- A student fills in each form on their own assignment and hands it in; the
-- instructor reads it while grading. A form is not graded on its own: the
-- skills' checklists are the grade.
-- =================================================================

-- The forms a Return Demonstration includes, by key, in the order shown.
alter table public.scenarios
  add column if not exists form_keys text[] not null default '{}';

create table if not exists public.return_demo_form_entries (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.scenario_assignments(id) on delete cascade,
  form_key text not null check (char_length(form_key) between 1 and 60),
  -- The rows the student entered, each an object of field key to value,
  -- kept to the form's fields by the API.
  entries jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, form_key)
);

create index if not exists idx_return_demo_form_entries_assignment
  on public.return_demo_form_entries(assignment_id);

alter table public.return_demo_form_entries enable row level security;

-- Written through the service-role API routes; these cover direct reads.
drop policy if exists "students read own return demo forms" on public.return_demo_form_entries;
create policy "students read own return demo forms" on public.return_demo_form_entries
  for select using (
    exists (
      select 1 from public.scenario_assignments a
      where a.id = return_demo_form_entries.assignment_id
        and a.student_id = auth.uid()
    )
  );

drop policy if exists "faculty and admin read return demo forms" on public.return_demo_form_entries;
create policy "faculty and admin read return demo forms" on public.return_demo_form_entries
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_return_demo_form_entries_updated_at on public.return_demo_form_entries;
create trigger trg_return_demo_form_entries_updated_at
  before update on public.return_demo_form_entries
  for each row execute function public.set_updated_at();
