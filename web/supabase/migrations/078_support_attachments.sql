-- =================================================================
-- 078: images on Help & Support messages and the Admins' replies.
--
-- Requests themselves need no table: like account requests, each one is
-- a notification per super admin (data.kind = 'support_request') sharing
-- a request_id, with the Admins' replies kept in data.replies.
--
-- Images live in the private `support` bucket under
-- support/<uploader id>/, read and written only through the API with the
-- service role. Optional: the first upload creates this bucket itself
-- when it's missing; this records it and pins the limits.
-- =================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', false, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = 4194304,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
