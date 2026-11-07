-- LockItIn: the family, their photos and the logo.
-- Photos live in a PRIVATE storage bucket ("family"), not in this public repo.
-- Only people signed in to the app can read them.

insert into storage.buckets (id, name, public) values ('family', 'family', false)
on conflict (id) do nothing;

drop policy if exists family_read on storage.objects;
create policy family_read on storage.objects for select to authenticated using (bucket_id = 'family');

-- Admins can add or replace photos from the app.
drop policy if exists family_admin_write on storage.objects;
create policy family_admin_write on storage.objects for insert to authenticated with check (bucket_id = 'family' and public.i_am_admin());
drop policy if exists family_admin_update on storage.objects;
create policy family_admin_update on storage.objects for update to authenticated using (bucket_id = 'family' and public.i_am_admin());

-- The family, left to right: Dad, Mum, Tobey, Jas. Tobey is the admin.
-- avatar_url "storage:<file>" points at a photo in the private bucket.
insert into players (name, color, avatar_url, is_admin, created_at) values
  ('Dad',   '#12A16B', 'storage:dad.jpg',   false, now()),
  ('Mum',   '#FF5C8A', 'storage:mum.jpg',   false, now() + interval '1 second'),
  ('Tobey', '#5B3DF5', 'storage:tobey.jpg', true,  now() + interval '2 seconds'),
  ('Jas',   '#F29A1F', 'storage:jas.jpg',   false, now() + interval '3 seconds')
on conflict do nothing;
