-- =============================================================
-- Fresno Skillshare - security hardening (pen-test remediation)
-- Run after 00021_avatar_uploads.sql. Idempotent / re-runnable.
--
-- Closes the findings from the security audit that are pure hardening
-- (no change to legitimate behavior):
--
--   1. trades was directly writable via PostgREST: a member could
--      INSERT a pre-'completed' row or PATCH status straight to
--      'completed', forging completed trades, inflating the
--      leaderboard, and minting badges onto other members. Now the
--      table only accepts safe initial states, and all status
--      transitions except accept/decline must flow through the
--      SECURITY DEFINER RPCs.
--   2. confirm_trade_completion was EXECUTE-able by anon and its guard
--      used NULL-unsafe comparisons, so an unauthenticated call
--      (auth.uid() = NULL) skipped the guard and force-completed
--      trades / self-awarded badges. Now revoked from anon and
--      NULL-guarded.
--   3. categories INSERT let a member forge created_by. Now pinned to
--      the caller (admins exempt).
--   4. message_threads UPDATE let a participant reassign the
--      counterparty or spoof the broadcast/newsletter flag. Now those
--      identity columns are immutable to clients.
-- =============================================================

-- ---------- 1. trades: safe inserts + guarded transitions ----------

drop policy if exists "Members propose trades" on public.trades;
create policy "Members propose trades"
  on public.trades for insert
  with check (
    proposer_id = auth.uid()
    and public.is_active_member()
    and status in ('open', 'proposed')
    and (
      (status = 'open' and partner_id is null and was_open = true)
      or (status = 'proposed' and partner_id is not null and was_open = false)
    )
  );

-- Client UPDATEs may only accept/decline a proposal. Everything else
-- (claiming, completion) goes through the definer RPCs below, which set
-- a transaction-local flag to bypass this guard.
create or replace function public.guard_trade_transition()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('fresno_skillshare.trade_transition', true) = 'on' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  if new.proposer_id is distinct from old.proposer_id
    or new.partner_id is distinct from old.partner_id
    or new.was_open is distinct from old.was_open
    or new.completed_at is distinct from old.completed_at
    or new.title is distinct from old.title
    or new.offering is distinct from old.offering
    or new.needing is distinct from old.needing then
    raise exception 'That trade field cannot be changed';
  end if;

  if new.status is distinct from old.status
    and not (old.status = 'proposed' and new.status in ('accepted', 'declined')) then
    raise exception 'That trade status change is not allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_trade_transition on public.trades;
create trigger guard_trade_transition before update on public.trades
  for each row execute function public.guard_trade_transition();

-- ---------- 2. confirm_trade_completion + select_trade_claimant ----------

create or replace function public.confirm_trade_completion(p_trade_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  select * into t from public.trades where id = p_trade_id for update;
  if t.id is null then
    raise exception 'Trade not found';
  end if;
  if t.status <> 'accepted' then
    raise exception 'Trade must be accepted before it can be completed';
  end if;

  if t.was_open then
    if auth.uid() <> t.proposer_id and not public.is_admin() then
      raise exception 'Only the member who posted this trade can mark it completed';
    end if;
  else
    if auth.uid() not in (t.proposer_id, t.partner_id) and not public.is_admin() then
      raise exception 'Only the two members in this trade or an admin can mark it completed';
    end if;
  end if;

  perform set_config('fresno_skillshare.trade_transition', 'on', true);
  update public.trades
  set status = 'completed', completed_at = now()
  where id = p_trade_id;
  perform set_config('fresno_skillshare.trade_transition', 'off', true);

  insert into public.badges (user_id, trade_id, label, awarded_by)
  values
    (t.proposer_id, t.id, t.title, auth.uid()),
    (t.partner_id, t.id, t.title, auth.uid());
end;
$$;

revoke all on function public.confirm_trade_completion(uuid) from public, anon;
grant execute on function public.confirm_trade_completion(uuid) to authenticated;

create or replace function public.select_trade_claimant(p_trade_id uuid, p_claimant_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  select * into t from public.trades where id = p_trade_id for update;
  if t.id is null then
    raise exception 'Trade not found';
  end if;
  if auth.uid() <> t.proposer_id and not public.is_admin() then
    raise exception 'Only the member who posted this trade can choose a claimant';
  end if;
  if t.status <> 'open' then
    raise exception 'This trade is no longer open';
  end if;
  if not exists (
    select 1 from public.trade_claims
    where trade_id = p_trade_id and claimant_id = p_claimant_id
  ) then
    raise exception 'That member has not claimed this trade';
  end if;

  perform set_config('fresno_skillshare.trade_transition', 'on', true);
  update public.trades
  set partner_id = p_claimant_id, status = 'accepted'
  where id = p_trade_id;
  perform set_config('fresno_skillshare.trade_transition', 'off', true);
end;
$$;

revoke all on function public.select_trade_claimant(uuid, uuid) from public, anon;
grant execute on function public.select_trade_claimant(uuid, uuid) to authenticated;

-- ---------- 3. categories: pin created_by to the caller ----------

drop policy if exists "Active members create categories" on public.categories;
create policy "Active members create categories"
  on public.categories for insert
  with check (
    (public.is_active_member() and created_by = auth.uid())
    or public.is_admin()
  );

-- ---------- 4. message_threads: immutable identity on client update ----------

create or replace function public.guard_thread_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- The message_after_insert trigger runs as definer and legitimately
  -- updates the rollup columns; it never touches these identity fields,
  -- so guarding them does not interfere with it.
  if public.is_admin() then
    return new;
  end if;
  if new.a_id is distinct from old.a_id
    or new.b_id is distinct from old.b_id
    or new.is_broadcast is distinct from old.is_broadcast
    or new.subject is distinct from old.subject then
    raise exception 'That conversation field cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_thread_update on public.message_threads;
create trigger guard_thread_update before update on public.message_threads
  for each row execute function public.guard_thread_update();
