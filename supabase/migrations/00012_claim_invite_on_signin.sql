-- =============================================================
-- Fresno Skillshare - claim invites at sign-in, not just signup
-- Run after 00011_approval_flow.sql.
--
-- Invites were only consumed by handle_new_user, which fires once,
-- when the auth account is first created. If someone signed up
-- BEFORE their join request was approved, the invite created by the
-- approval was never checked again, and their account sat in
-- 'pending' forever no matter how many times they signed in.
--
-- claim_pending_invite() closes that ordering gap: the /pending page
-- calls it on load and on "Check again". If the signed-in user is
-- pending and an unused invite matches their email, the invite is
-- consumed and the account activates on the spot.
-- =============================================================

-- Extend the profile guard with a second transaction-local bypass,
-- alongside the account-erasure one from 00004. Everything else is
-- unchanged from the 00004 definition.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('fresno_skillshare.account_erasure', true) = 'on' then
    return new;
  end if;
  if current_setting('fresno_skillshare.invite_claim', true) = 'on' then
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

create or replace function public.claim_pending_invite()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
  v_invite_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Only pending accounts have anything to claim.
  if not exists (
    select 1 from public.profiles where id = auth.uid() and status = 'pending'
  ) then
    return false;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return false;
  end if;

  select id into v_invite_id
  from public.invites
  where lower(email) = lower(v_email) and used_at is null
  limit 1;

  if v_invite_id is null then
    return false;
  end if;

  update public.invites set used_at = now() where id = v_invite_id;

  -- Transaction-local bypass of the role/status clamp for this one update.
  perform set_config('fresno_skillshare.invite_claim', 'on', true);
  update public.profiles set status = 'active' where id = auth.uid();
  perform set_config('fresno_skillshare.invite_claim', 'off', true);

  return true;
end;
$$;
