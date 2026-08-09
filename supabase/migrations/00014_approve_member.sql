-- =============================================================
-- Fresno Skillshare - direct member approval
-- Run after 00013_claim_approved_requests.sql.
--
-- The public "request to join" form is retired: people simply create
-- an account (password or Google), land in 'pending', and an admin
-- approves the account itself under Admin > Members. This RPC flips
-- the status and returns the member's email so the client can send
-- them a sign-in link the moment they are approved.
--
-- The join_requests table is kept for historical data; nothing new
-- is written to it.
-- =============================================================

create or replace function public.approve_member(p_user_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve members';
  end if;

  update public.profiles
  set status = 'active'
  where id = p_user_id and status = 'pending';

  if not found then
    raise exception 'That account is not waiting for approval';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  return v_email;
end;
$$;
