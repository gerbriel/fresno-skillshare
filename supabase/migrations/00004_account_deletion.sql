-- =============================================================
-- Fresno Skillshare - account deletion (GDPR erasure)
-- Run after 00003_google_auth.sql.
--
-- Design: deleting an account erases the person, not the shared
-- history. Messages, reviews, trades, and their tasks also belong
-- to the other member in the exchange, so those rows stay put and
-- the profile row becomes an anonymized tombstone ('Deleted
-- member', status 'deleted') that keeps attribution joins working.
-- Everything that is only theirs (listings, badges, invites and
-- join requests carrying their email, rate-limit counters, and the
-- auth.users row with email/password/OAuth identity) is deleted
-- outright. Deleting the auth.users row also revokes every session
-- and refresh token, so the member is signed out everywhere.
--
-- Two entry points, both security definer:
--   * delete_my_account()            - a member deletes themself
--   * admin_delete_account(user_id)  - an admin deletes a member
--
-- Note: after this migration, deleting a user from the Supabase
-- dashboard no longer cascades to their profile (the FK is gone).
-- Always delete accounts through these functions instead.
-- =============================================================

-- The tombstone must survive the auth.users delete, so the profile
-- row can no longer cascade from it.
alter table public.profiles drop constraint profiles_id_fkey;

alter table public.profiles drop constraint profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('pending', 'active', 'suspended', 'deleted'));

-- Members can see tombstones so kept messages, reviews, and trades
-- still show who they were exchanged with ('Deleted member').
drop policy "Members can view active profiles" on public.profiles;
create policy "Members can view active profiles"
  on public.profiles for select
  using (
    id = auth.uid()
    or public.is_admin()
    or (public.is_active_member() and status in ('active', 'deleted'))
  );

-- Nobody can start a new conversation with a tombstone (or with a
-- pending/suspended member). send_newsletter is unaffected: it runs
-- as the table owner and only targets active members.
drop policy "Members start threads" on public.message_threads;
create policy "Members start threads"
  on public.message_threads for insert
  with check (
    a_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.profiles p
      where p.id = b_id and p.status = 'active'
    )
  );

-- erase_account() runs on behalf of the member being deleted, who is
-- not an admin, so the privilege-protection trigger would silently
-- undo the status flip. A transaction-local flag lets the erasure
-- update through; clients cannot set custom GUCs through PostgREST,
-- so only our security-definer functions can raise it.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('fresno_skillshare.account_erasure', true) = 'on' then
    return new;
  end if;
  -- Only clamp when a signed-in member is the one writing. A null auth.uid()
  -- means the caller is the SQL editor, a service_role job, or a database
  -- trigger, and those need to set role/status (bootstrapping the first
  -- admin, for one). Anonymous API callers cannot reach this trigger: the
  -- update policy requires id = auth.uid(), which never matches for them.
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;

-- Shared erasure path. Not callable from the API (execute is revoked
-- below); only delete_my_account() and admin_delete_account() reach it.
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

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to delete your account';
  end if;

  -- Don't let the co-op lock itself out of the admin dashboard.
  if exists (select 1 from public.profiles where id = v_uid and role = 'admin')
     and not exists (
       select 1 from public.profiles
       where role = 'admin' and status = 'active' and id <> v_uid
     ) then
    raise exception 'You are the only admin. Make another member an admin before deleting your account.';
  end if;

  perform public.erase_account(v_uid);
end;
$$;

create or replace function public.admin_delete_account(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete accounts';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Delete your own account from your profile page instead';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    raise exception 'Remove their admin access first, then delete the account';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status <> 'deleted') then
    raise exception 'Member not found';
  end if;

  perform public.erase_account(p_user_id);
end;
$$;

revoke execute on function public.delete_my_account() from anon;
revoke execute on function public.admin_delete_account(uuid) from anon;
