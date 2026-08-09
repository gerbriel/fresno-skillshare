-- =============================================================
-- Fresno Skillshare - invite roles and permanent tombstone removal
-- Run after 00016_repair_signup_trigger.sql.
--
--   * Invites can now carry a role. Signing up (or claiming at
--     sign-in) with an admin invite grants admin access immediately.
--   * Admins can permanently remove "Deleted member" tombstones.
--     This cascades: the erased person's messages, reviews, trades,
--     and threads disappear from everyone's history. The two-step
--     design (erase, then purge) keeps GDPR deletion reversible in
--     appearance only - erasure is still instant and irreversible;
--     purging is for cleaning up test data and old tombstones.
-- =============================================================

alter table public.invites
  add column role text not null default 'member' check (role in ('member', 'admin'));

-- Signup honors the invited role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_invite_id uuid;
  v_invite_role text;
  v_name text;
  v_avatar text;
begin
  select id, role into v_invite_id, v_invite_role
  from public.invites
  where lower(email) = lower(new.email) and used_at is null
  limit 1;

  v_name := left(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), 80);
  if v_name = '' then
    v_name := left(split_part(new.email, '@', 1), 80);
  end if;

  v_avatar := left(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  ), 500);
  if v_avatar is null or v_avatar !~* '^https?://' then
    v_avatar := null;
  end if;

  insert into public.profiles (id, display_name, avatar_url, role, status)
  values (
    new.id,
    v_name,
    v_avatar,
    coalesce(v_invite_role, 'member'),
    case when v_invite_id is not null then 'active' else 'pending' end
  );

  if v_invite_id is not null then
    update public.invites set used_at = now() where id = v_invite_id;
  end if;

  return new;
end;
$$;

-- Claiming at sign-in honors the invited role too.
create or replace function public.claim_pending_invite()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
  v_invite_id uuid;
  v_invite_role text;
  v_approved boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and status = 'pending'
  ) then
    return false;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return false;
  end if;

  select id, role into v_invite_id, v_invite_role
  from public.invites
  where lower(email) = lower(v_email) and used_at is null
  limit 1;

  v_approved := exists (
    select 1 from public.join_requests
    where lower(email) = lower(v_email) and status = 'approved'
  );

  if v_invite_id is null and not v_approved then
    return false;
  end if;

  if v_invite_id is not null then
    update public.invites set used_at = now() where id = v_invite_id;
  end if;

  perform set_config('fresno_skillshare.invite_claim', 'on', true);
  update public.profiles
  set status = 'active', role = coalesce(v_invite_role, role)
  where id = auth.uid();
  perform set_config('fresno_skillshare.invite_claim', 'off', true);

  return true;
end;
$$;

-- Only tombstones can be deleted, and only by admins. The cascade
-- removes the messages, reviews, trades, and threads attributed to
-- the erased account.
create policy "Admins purge deleted tombstones"
  on public.profiles for delete
  using (public.is_admin() and status = 'deleted');
