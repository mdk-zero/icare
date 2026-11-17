-- =================================================================
-- 095: Forms an instructor uploads for a Return Demonstration.
--
-- Next to the built-in forms (094, such as the DOH PhilPEN form), an
-- instructor can upload any form as a PDF. The app reads its fields from the
-- file, the instructor checks and fixes them, and the result is kept here:
-- its pages (a picture of each, held in storage) and its sections of fields,
-- each tied to its place on a page, the same shape the built-in forms have in
-- app/lib/return-demo-forms.ts. A Return Demonstration names one by the key
-- `custom:<id>` in scenarios.form_keys; what students enter stays in
-- return_demo_form_entries, as for any form.
-- =================================================================

create table if not exists public.return_demo_custom_forms (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 600),
  -- [{ "image": "<public URL>", "width": <points>, "height": <points> }, ...]
  pages jsonb not null,
  -- [{ "title": "...", "fields": [ ... ] }, ...], checked by the API
  sections jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_return_demo_custom_forms_created_by
  on public.return_demo_custom_forms(created_by);

alter table public.return_demo_custom_forms enable row level security;

-- Written through the service-role API routes; this covers direct reads.
drop policy if exists "faculty and admin read custom forms" on public.return_demo_custom_forms;
create policy "faculty and admin read custom forms" on public.return_demo_custom_forms
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_return_demo_custom_forms_updated_at on public.return_demo_custom_forms;
create trigger trg_return_demo_custom_forms_updated_at
  before update on public.return_demo_custom_forms
  for each row execute function public.set_updated_at();

-- The pictures of blank forms. Public: a blank form holds nothing personal,
-- and the student app loads the pictures straight from their URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('return-demo-forms', 'return-demo-forms', true, 5242880, array['image/png'])
on conflict (id) do nothing;
