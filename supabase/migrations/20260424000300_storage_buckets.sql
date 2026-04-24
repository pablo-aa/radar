-- Storage: private buckets for user CVs and voice notes.
-- Files are scoped per user via a folder named with the user's auth.uid().
-- Path shape: <bucket>/<auth.uid()>/<filename>.<ext>

insert into storage.buckets (id, name, public)
  values ('cvs', 'cvs', false), ('voice', 'voice', false)
  on conflict (id) do nothing;

-- CVs: per-user folder
create policy "cvs: own folder read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cvs: own folder insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cvs: own folder update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cvs: own folder delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Voice notes: same per-user folder pattern
create policy "voice: own folder read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'voice' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "voice: own folder insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'voice' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "voice: own folder update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'voice' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "voice: own folder delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'voice' and (storage.foldername(name))[1] = (select auth.uid())::text);
