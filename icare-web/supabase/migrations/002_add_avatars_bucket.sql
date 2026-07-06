-- =================================================================
-- Private avatars bucket for user profile pictures.
-- Uploads and signed-URL generation are performed server-side via
-- the service role key, so no storage RLS policies are required here.
-- =================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do update set public = false;
