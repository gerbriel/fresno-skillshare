-- =============================================================
-- Fresno Skillshare - trade claims and completion rules
-- Run after 00017_invite_roles_and_purge.sql.
--
-- New rules:
--   * Direct trades: EITHER participant can mark the trade completed,
--     and so can an admin. Anyone else cannot.
--   * Open trades ("open to anyone"): claiming no longer locks the
--     trade to the first claimer. Any number of members can claim;
--     the trade stays on the board until the poster chooses one of
--     the claimants. Only the poster (or an admin) can complete it.
--   * Completion awards the badge to BOTH participants - a completed
--     barter is a shared milestone.
-- =============================================================

-- ---------- claims (many per open trade) ----------

create table public.trade_claims (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  claimant_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (trade_id, claimant_id)
);
create index trade_claims_trade_idx on public.trade_claims (trade_id, created_at);

alter table public.trade_claims enable row level security;

-- Claimants see their own claims; the poster sees everyone who claimed
-- their trade; admins see all. Inserts only happen through
-- claim_open_trade() (security definer), so no insert policy exists.
create policy "Claimants and posters view claims"
  on public.trade_claims for select
  using (
    claimant_id = auth.uid()
    or exists (
      select 1 from public.trades t
      where t.id = trade_id and t.proposer_id = auth.uid()
    )
    or public.is_admin()
  );

create policy "Claimants withdraw their own claims"
  on public.trade_claims for delete
  using (claimant_id = auth.uid() or public.is_admin());

-- Claims update live on the poster's screen.
alter publication supabase_realtime add table public.trade_claims;
alter table public.trade_claims replica identity full;

-- ---------- claiming: register interest, keep the board open ----------

create or replace function public.claim_open_trade(p_trade_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
begin
  if not public.is_active_member() then
    raise exception 'Only active members can claim a trade';
  end if;

  perform public.enforce_rate_limit('claim_trade', 20, 3600);

  select * into t from public.trades where id = p_trade_id;
  if t.id is null then
    raise exception 'Trade not found';
  end if;
  if t.status <> 'open' then
    raise exception 'This trade is no longer open';
  end if;
  if t.proposer_id = auth.uid() then
    raise exception 'You cannot claim your own trade';
  end if;

  insert into public.trade_claims (trade_id, claimant_id)
  values (p_trade_id, auth.uid())
  on conflict (trade_id, claimant_id) do nothing;
end;
$$;

revoke all on function public.claim_open_trade(uuid) from public, anon;
grant execute on function public.claim_open_trade(uuid) to authenticated;

-- ---------- the poster picks a claimant ----------

-- Locks the trade row so two picks cannot race. Other claims are kept
-- for history; the UI stops offering them once the trade leaves the
-- board.
create or replace function public.select_trade_claimant(p_trade_id uuid, p_claimant_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
begin
  select * into t from public.trades where id = p_trade_id for update;
  if t.id is null then
    raise exception 'Trade not found';
  end if;
  if t.proposer_id <> auth.uid() and not public.is_admin() then
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

  update public.trades
  set partner_id = p_claimant_id, status = 'accepted'
  where id = p_trade_id;
end;
$$;

revoke all on function public.select_trade_claimant(uuid, uuid) from public, anon;
grant execute on function public.select_trade_claimant(uuid, uuid) to authenticated;

-- ---------- completion ----------

-- Direct trades: either participant or an admin. Open-board trades:
-- only the poster or an admin. Both participants earn the badge.
create or replace function public.confirm_trade_completion(p_trade_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
begin
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

  update public.trades
  set status = 'completed', completed_at = now()
  where id = p_trade_id;

  -- A completed barter is a shared milestone: both sides earn it.
  insert into public.badges (user_id, trade_id, label, awarded_by)
  values
    (t.proposer_id, t.id, t.title, auth.uid()),
    (t.partner_id, t.id, t.title, auth.uid());
end;
$$;
