-- =================================================================
-- 061: The Library — study materials instructors publish per skill.
--
-- Every material belongs to one Taylor's skill (045), so the library is
-- organised the way the book is: chapter → skill → materials. A material is
-- one of:
--   video   a YouTube video, played embedded in the app (youtube_id)
--   note    a written note in markdown (body_md)
--   pdf     an uploaded PDF handout (file_*)
--   slides  an uploaded PowerPoint deck (file_*)
--   link    an external web page (url)
--
-- target_sections holds section names, like assessments (017): the sections
-- whose students see it once published; null means every section.
-- Drafts are only visible to faculty.
--
-- library_suggestions is a curated catalog of YouTube skill demos, loaded by
-- web/scripts/seed-library-suggestions.ts. Students never read it; an
-- instructor publishes a suggestion, which copies it into library_materials
-- as their own video.
--
-- library_views records the first and latest time a student opened a
-- material, for the student's "new" dot and the instructor's view count.
--
-- Files live in the private `library` bucket under library/<author id>/.
-- Everything goes through the service role in the API routes, which check
-- the caller's role and sections themselves, so RLS is on with no policies.
-- =================================================================

create table if not exists public.library_materials (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null references public.taylor_skills(id) on delete restrict,
  kind text not null check (kind in ('video', 'note', 'pdf', 'slides', 'link')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '',
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  body_md text,
  url text,
  file_path text,
  file_name text,
  file_size int,
  mime_type text,
  target_sections text[],
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_materials_kind_content check (
    case kind
      when 'video' then youtube_id is not null
      when 'note' then body_md is not null and char_length(btrim(body_md)) > 0
      when 'link' then url is not null
      else file_path is not null
    end
  )
);

create index if not exists idx_library_materials_skill on public.library_materials(skill_id);
create index if not exists idx_library_materials_author on public.library_materials(created_by);
create index if not exists idx_library_materials_status on public.library_materials(status, published_at desc);

drop trigger if exists trg_library_materials_updated_at on public.library_materials;
create trigger trg_library_materials_updated_at
  before update on public.library_materials
  for each row execute function public.set_updated_at();

create table if not exists public.library_suggestions (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null references public.taylor_skills(id) on delete cascade,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null,
  channel text not null default '',
  sort_order int not null default 0,
  unique (skill_id, youtube_id)
);

create index if not exists idx_library_suggestions_skill on public.library_suggestions(skill_id);

create table if not exists public.library_views (
  material_id uuid not null references public.library_materials(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  primary key (material_id, user_id)
);

create index if not exists idx_library_views_user on public.library_views(user_id);

alter table public.library_materials enable row level security;
alter table public.library_suggestions enable row level security;
alter table public.library_views enable row level security;

-- Private bucket; uploads use signed upload URLs the API hands out.
insert into storage.buckets (id, name, public, file_size_limit)
values ('library', 'library', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
