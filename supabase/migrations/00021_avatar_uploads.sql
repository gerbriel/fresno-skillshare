-- =============================================================
-- Fresno Skillshare - profile photo uploads
-- Run after 00020_public_categories.sql.
--
-- Members upload a profile photo instead of pasting an image URL.
-- Photos live in a public 'avatars' storage bucket at
-- <user-id>/avatar: one object per member, replaced in place on
-- re-upload (the app appends ?v=<timestamp> to the stored URL so
-- browsers refetch). The object path contains the member's UUID,
-- so the URL is unguessable but viewable by anyone who has it -
-- same trust model as the externally hosted avatar URLs the app
-- accepted before. RLS scopes writes to the uploader's own folder,
-- and account erasure (00004) now clears the folder too.
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB; the client resizes before upload, this is the backstop
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Members upload own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_member()
  );

create policy "Members replace own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Admins can also delete, so an inappropriate photo can be pulled
-- (clearing profiles.avatar_url alone would leave the file live).
create policy "Members delete own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Account erasure now clears the uploaded photo as well. Removing
-- the storage.objects row revokes all access to the file instantly.
-- Body otherwise identical to 00004.
create or replace function public.erase_account(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = p_user_id;

  perform set_config('fresno_skillshare.account_erasure', 'on', true);

  -- Content that is only theirs goes away.
  delete from public.listings where owner_id = p_user_id;
  delete from public.badges where user_id = p_user_id;
  delete from public.rate_limits where actor = p_user_id::text;
  delete from storage.objects
  where bucket_id = 'avatars' and (storage.foldername(name))[1] = p_user_id::text;

  -- Their email is personal data wherever it appears.
  if v_email is not null then
    delete from public.invites where lower(email) = lower(v_email);
    delete from public.join_requests where lower(email) = lower(v_email);
  end if;

  -- Keep rows that are about other people, drop the pointers to them.
  update public.invites set invited_by = null where invited_by = p_user_id;
  update public.join_requests set reviewed_by = null where reviewed_by = p_user_id;
  update public.newsletters set author_id = null where author_id = p_user_id;

  -- Shared history (messages, reviews, trades, tasks) stays, now
  -- attributed to this anonymized tombstone.
  update public.profiles
  set display_name = 'Deleted member',
      avatar_url = null,
      bio = null,
      location = null,
      role = 'member',
      status = 'deleted'
  where id = p_user_id;

  -- Removes email, password hash, and OAuth identities, and revokes
  -- every session and refresh token (signed out on all devices).
  delete from auth.users where id = p_user_id;
end;
$$;

revoke execute on function public.erase_account(uuid) from public, anon, authenticated;
