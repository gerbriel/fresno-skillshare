-- =============================================================
-- Fresno Skillshare - members can propose events
-- Run after 00009_trade_offer_and_need.sql.
--
-- Events were admin-only. Now any active member can propose one; it
-- sits in 'pending' until an admin approves or rejects it. Only
-- approved events are public, so a proposal never reaches the landing
-- page on its own.
-- =============================================================

alter table public.events
  add column status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected')),
  add column proposed_by uuid references public.profiles(id) on delete set null,
  add column review_note text
    constraint events_review_note_len check (review_note is null or char_length(review_note) <= 500);

-- Anything that already existed was created by an admin.
update public.events set status = 'approved' where status is null;

create index events_status_starts_idx on public.events (status, starts_at);

-- ---------- visibility ----------

-- Public sees approved events only. Proposers can follow their own
-- submission through review; admins see everything.
drop policy "Anyone can read events" on public.events;
create policy "Anyone reads approved events"
  on public.events for select
  to anon, authenticated
  using (
    status = 'approved'
    or proposed_by = auth.uid()
    or public.is_admin()
  );

-- ---------- proposing ----------

-- Members may only insert a pending proposal authored by themselves.
-- Admins keep publishing directly.
create policy "Members propose events"
  on public.events for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_member()
      and status = 'pending'
      and proposed_by = auth.uid()
    )
  );

-- A member can withdraw their own proposal while it is still pending.
create policy "Proposers withdraw pending events"
  on public.events for delete
  to authenticated
  using (proposed_by = auth.uid() and status = 'pending');

-- Approving or rejecting is an admin act, and the existing admin update
-- policy from 00006 already covers it.

-- Guard the review fields: a member cannot flip their own proposal to
-- approved, the same way they cannot promote their own profile.
create or replace function public.protect_event_review()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.status := old.status;
    new.review_note := old.review_note;
  end if;
  return new;
end;
$$;

create trigger protect_event_review
  before update on public.events
  for each row execute function public.protect_event_review();

-- Proposals are rate limited like other member-authored content.
create trigger rl_events before insert on public.events
  for each row execute function public.rate_limit_trigger('events', '10', '3600');
