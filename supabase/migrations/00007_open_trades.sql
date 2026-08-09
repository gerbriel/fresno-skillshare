-- =============================================================
-- Fresno Skillshare - open trades ("anyone can claim it")
-- Run after 00006_events.sql.
--
-- Until now every trade named a partner up front. A member who just
-- needs something done - an ISO post - can now leave the partner
-- blank. The trade lands on an open board that every active member
-- can see, and the first person to claim it becomes the partner.
--
--   * partner_id is nullable, and 'open' joins the status enum.
--     A constraint keeps the two in sync: open means unclaimed,
--     anything else means a partner is set.
--   * Claiming runs through claim_open_trade(), which locks the row,
--     so two people racing for the same trade cannot both win.
--   * was_open records that a trade came off the board, because it
--     flips who confirms completion and who earns the badge (see
--     confirm_trade_completion below).
-- =============================================================

alter table public.trades
  alter column partner_id drop not null,
  add column was_open boolean not null default false;

alter table public.trades drop constraint if exists trades_status_check;
alter table public.trades
  add constraint trades_status_check
  check (status in ('open', 'proposed', 'accepted', 'completed', 'declined'));

-- Unclaimed and open go together; every other status has a partner.
alter table public.trades
  add constraint trades_open_has_no_partner check (
    (status = 'open' and partner_id is null)
    or (status <> 'open' and partner_id is not null)
  );

-- The open board is browsed by status, newest first.
create index trades_open_idx on public.trades (created_at desc) where status = 'open';

-- ---------- visibility ----------

-- Open trades are a public board for members; claimed ones stay private
-- to the two participants.
drop policy "Participants view trades" on public.trades;
create policy "Participants and members browsing the open board view trades"
  on public.trades for select
  using (
    proposer_id = auth.uid()
    or partner_id = auth.uid()
    or (status = 'open' and public.is_active_member())
    or public.is_admin()
  );

-- Cancelling an unclaimed post is the same act as withdrawing a proposal.
drop policy "Proposer or admin deletes trades" on public.trades;
create policy "Proposer or admin deletes trades"
  on public.trades for delete
  using (
    (proposer_id = auth.uid() and status in ('open', 'proposed'))
    or public.is_admin()
  );

-- Let members read the checklist before deciding to claim. This is a
-- second permissive SELECT policy, so it only widens reads; writing
-- tasks still requires being a participant.
create policy "Members view open trade tasks"
  on public.trade_tasks for select
  using (
    public.is_active_member()
    and exists (
      select 1 from public.trades t
      where t.id = trade_id and t.status = 'open'
    )
  );

-- ---------- creating an open trade ----------

-- A null partner now means "post it to the open board" instead of
-- being an error.
create or replace function public.create_trade_with_tasks(
  p_partner_id uuid,
  p_title text,
  p_notes text,
  p_tasks text[]
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_trade_id uuid;
  v_task text;
begin
  if p_partner_id is not null then
    if p_partner_id = auth.uid() then
      raise exception 'You cannot propose a trade with yourself';
    end if;
    if not exists (select 1 from public.profiles where id = p_partner_id and status = 'active') then
      raise exception 'Trade partner not found';
    end if;
  end if;
  if btrim(coalesce(p_title, '')) = '' or char_length(p_title) > 140 then
    raise exception 'Trade title is required (140 characters max)';
  end if;
  if coalesce(array_length(p_tasks, 1), 0) > 30 then
    raise exception 'A trade can have at most 30 tasks';
  end if;

  insert into public.trades (proposer_id, partner_id, title, notes, status, was_open)
  values (
    auth.uid(),
    p_partner_id,
    btrim(p_title),
    nullif(left(btrim(coalesce(p_notes, '')), 2000), ''),
    case when p_partner_id is null then 'open' else 'proposed' end,
    p_partner_id is null
  )
  returning id into v_trade_id;

  foreach v_task in array coalesce(p_tasks, '{}')
  loop
    if btrim(v_task) <> '' then
      insert into public.trade_tasks (trade_id, title)
      values (v_trade_id, left(btrim(v_task), 200));
    end if;
  end loop;

  return v_trade_id;
end;
$$;

-- ---------- claiming ----------

-- Security definer because the claimer is not a participant yet, so RLS
-- would refuse the update. Every check the policy would have made is
-- made here instead. `for update` serializes concurrent claims: the
-- loser wakes up, sees the status is no longer 'open', and is told so.
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

  select * into t from public.trades where id = p_trade_id for update;
  if t.id is null then
    raise exception 'Trade not found';
  end if;
  if t.status <> 'open' then
    raise exception 'Someone already claimed this trade';
  end if;
  if t.proposer_id = auth.uid() then
    raise exception 'You cannot claim your own trade';
  end if;

  update public.trades
  set partner_id = auth.uid(), status = 'accepted'
  where id = p_trade_id;
end;
$$;

revoke all on function public.claim_open_trade(uuid) from public, anon;
grant execute on function public.claim_open_trade(uuid) to authenticated;

-- ---------- completion ----------

-- Whoever asked for the work confirms it, and whoever did the work gets
-- the badge. For a normal trade that is the partner confirming and the
-- proposer earning it, unchanged. For a claimed open trade it mirrors:
-- the proposer asked, so the proposer confirms, and the claimer earns
-- the badge. Either way the confirmer is never the recipient, so a
-- badge still cannot be self-awarded.
create or replace function public.confirm_trade_completion(p_trade_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
  unfinished int;
  v_confirmer uuid;
  v_recipient uuid;
begin
  select * into t from public.trades where id = p_trade_id for update;
  if t.id is null then
    raise exception 'Trade not found';
  end if;

  if t.was_open then
    v_confirmer := t.proposer_id;
    v_recipient := t.partner_id;
  else
    v_confirmer := t.partner_id;
    v_recipient := t.proposer_id;
  end if;

  if auth.uid() <> v_confirmer then
    if t.was_open then
      raise exception 'Only the member who posted this trade can confirm it is done';
    else
      raise exception 'Only the trade partner can confirm completion';
    end if;
  end if;
  if t.status <> 'accepted' then
    raise exception 'Trade must be accepted before it can be completed';
  end if;

  select count(*) into unfinished
  from public.trade_tasks where trade_id = p_trade_id and not done;
  if unfinished > 0 then
    raise exception 'All tasks must be checked off first';
  end if;

  update public.trades
  set status = 'completed', completed_at = now()
  where id = p_trade_id;

  insert into public.badges (user_id, trade_id, label, awarded_by)
  values (v_recipient, t.id, t.title, v_confirmer);
end;
$$;
