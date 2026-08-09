-- =============================================================
-- Fresno Skillshare - claim approved join requests at sign-in
-- Run after 00012_claim_invite_on_signin.sql.
--
-- The invitation email creates the auth account for the approved
-- address, and that creation consumes the invite. If the person then
-- signs in a different way (Google, a second signup) and lands on a
-- different pending account with the SAME email, no unused invite is
-- left to claim and they were stranded in 'pending'.
--
-- Fix: an approved join request is just as much proof of approval as
-- an unused invite, so claim_pending_invite() now honors either one.
-- =============================================================

create or replace function public.claim_pending_invite()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
  v_invite_id uuid;
  v_approved boolean;
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

  -- Transaction-local bypass of the role/status clamp for this one update.
  perform set_config('fresno_skillshare.invite_claim', 'on', true);
  update public.profiles set status = 'active' where id = auth.uid();
  perform set_config('fresno_skillshare.invite_claim', 'off', true);

  return true;
end;
$$;
