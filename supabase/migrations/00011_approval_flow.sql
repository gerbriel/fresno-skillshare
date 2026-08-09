-- =============================================================
-- Fresno Skillshare - join request approval flow
-- Run after 00010_event_proposals.sql.
--
-- Approving a join request now also handles the person who already
-- created an account and is sitting in 'pending': their profile is
-- activated directly (invites are only consumed at signup time, so
-- previously these two queues could drift apart).
--
-- The function becomes SECURITY DEFINER so it can look up the email
-- on auth.users; the admin check guards the privilege.
-- =============================================================

create or replace function public.approve_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.join_requests;
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve join requests';
  end if;

  select * into r from public.join_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'Join request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request was already reviewed';
  end if;

  -- Already signed up and waiting? Activate that account directly.
  select u.id into v_user_id
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(r.email) and p.status = 'pending'
  limit 1;

  if v_user_id is not null then
    update public.profiles set status = 'active' where id = v_user_id;
  else
    -- No account yet: leave an invite so their eventual signup (email
    -- link, password, or Google) activates instantly.
    insert into public.invites (email, invited_by, note)
    values (r.email, auth.uid(), 'Approved join request')
    on conflict (lower(email)) where used_at is null do nothing;
  end if;

  update public.join_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;
end;
$$;
