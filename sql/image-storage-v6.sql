-- Scenez Stream v6: public image storage bucket + admin-only upload policies
-- Run this ONCE in Supabase SQL Editor after schema.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scenez-images',
  'scenez-images',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Scenez admins upload images" on storage.objects;
create policy "Scenez admins upload images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'scenez-images'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Scenez admins update images" on storage.objects;
create policy "Scenez admins update images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'scenez-images'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  bucket_id = 'scenez-images'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Scenez admins delete images" on storage.objects;
create policy "Scenez admins delete images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'scenez-images'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
