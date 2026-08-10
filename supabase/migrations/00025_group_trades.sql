-- =============================================================
-- Fresno Skillshare - group trades (many helpers per trade)
-- Run after 00024_newsletter_polls.sql. Idempotent / re-runnable.
--
-- A trade posted to the open board can now ask for more than one
-- helper: a fixed range (e.g. 3-5) or open-ended ("as many as want
-- to help"). Multiple members claim; the poster brings helpers into
-- the group; when the work is done the poster (or an admin) completes
-- it and EVERY accepted helper earns the badge and trade credit.
--
--   * min_helpers / max_helpers on trades (max null = unlimited).
--   * trade_participants: the accepted group (the single partner_id
--     path still serves 1:1 direct and single-claim open trades).
--   * A group trade stays on the open board while it fills, so people
--     can keep joining until the poster completes it.
-- =============================================================

alter table public.trades
  add column if not exists min_helpers int not null default 1,
  add column if not exists max_helpers int;

do $$ begin
  alter table public.trades add constraint trades_helpers_range
    check (min_helpers >= 1 and (max_helpers is null or max_helpers >= min_helpers));
exception when duplicate_object then null; end $$;

-- The accepted group. For 1:1 direct and single-claim open trades the
-- partner still lives in trades.partner_id; this table holds the extra
-- helpers on multi-helper trades.
create table if not exists public.trade_participants (
  trade_id uuid not null references public.trades(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trade_id, member_id)
);
create index if not exists trade_participants_member_idx on public.trade_participants (member_id);

alter table public.trade_participants enable row level security;

create or replace function public.can_see_trade(p_trade_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    exists (
      select 1 from public.trades t
      where t.id = p_trade_id
        and (
          t.proposer_id = auth.uid()
          or t.partner_id = auth.uid()
          or (t.status = 'open' and public.is_active_member())
          or public.is_admin()
        )
    )
    or exists (
      select 1 from public.trade_participants tp
      where tp.trade_id = p_trade_id and tp.member_id = auth.uid()
    );
$$;

drop policy if exists "See participants of visible trades" on public.trade_participants;
create policy "See participants of visible trades"
  on public.trade_participants for select
  using (public.can_see_trade(trade_id));

drop policy if exists "Admins manage participants" on public.trade_participants;
create policy "Admins manage participants"
  on public.trade_participants for delete
  using (public.is_admin());

-- Backfill: existing accepted/completed trades' partners become group
-- rows too, so completion/scoring can read one source uniformly.
insert into public.trade_participants (trade_id, member_id)
select id, partner_id from public.trades
where partner_id is not null and status in ('accepted', 'completed')
on conflict do nothing;

-- ---------- create: accept helper counts ----------

drop function if exists public.create_trade(uuid, text, text, text);
create or replace function public.create_trade(
  p_partner_id uuid,
  p_title text,
  p_offering text,
  p_needing text,
  p_max_helpers int default 1,
  p_min_helpers int default 1
)
returns uuid
language plpgsql set search_path = public
as $$
declare
  v_trade_id uuid;
  v_offering text := left(btrim(coalesce(p_offering, '')), 2000);
  v_needing text := left(btrim(coalesce(p_needing, '')), 2000);
  v_min int := greatest(coalesce(p_min_helpers, 1), 1);
  v_max int := p_max_helpers;  -- null = unlimited
begin
  if p_partner_id is not null then
    if p_partner_id = auth.uid() then
      raise exception 'You cannot propose a trade with yourself';
    end if;
    if not exists (select 1 from public.profiles where id = p_partner_id and status = 'active') then
      raise exception 'Trade partner not found';
    end if;
    -- A named partner is always a 1:1 trade.
    v_min := 1;
    v_max := 1;
  end if;
  if btrim(coalesce(p_title, '')) = '' or char_length(p_title) > 140 then
    raise exception 'Trade title is required (140 characters max)';
  end if;
  if v_offering = '' then raise exception 'Say what you are offering'; end if;
  if v_needing = '' then raise exception 'Say what you need'; end if;
  if v_max is not null and (v_max < v_min or v_max > 50) then
    raise exception 'The number of helpers is out of range';
  end if;

  insert into public.trades
    (proposer_id, partner_id, title, offering, needing, status, was_open, min_helpers, max_helpers)
  values (
    auth.uid(), p_partner_id, btrim(p_title), v_offering, v_needing,
    case when p_partner_id is null then 'open' else 'proposed' end,
    p_partner_id is null,
    v_min, v_max
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

-- ---------- accept a claimant (single or into the group) ----------

create or replace function public.accept_trade_claimant(p_trade_id uuid, p_claimant_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
  v_multi boolean;
  v_accepted int;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;

  select * into t from public.trades where id = p_trade_id for update;
  if t.id is null then raise exception 'Trade not found'; end if;
  if t.proposer_id <> auth.uid() and not public.is_admin() then
    raise exception 'Only the member who posted this trade can add helpers';
  end if;
  if t.status not in ('open', 'accepted') then
    raise exception 'This trade is no longer taking helpers';
  end if;
  if not exists (
    select 1 from public.trade_claims where trade_id = p_trade_id and claimant_id = p_claimant_id
  ) then
    raise exception 'That member has not claimed this trade';
  end if;

  v_multi := (t.max_helpers is null or t.max_helpers <> 1);

  if v_multi then
    select count(*) into v_accepted from public.trade_participants where trade_id = p_trade_id;
    if t.max_helpers is not null and v_accepted >= t.max_helpers then
      raise exception 'This group is already full';
    end if;
    insert into public.trade_participants (trade_id, member_id)
    values (p_trade_id, p_claimant_id)
    on conflict do nothing;
    -- Multi-helper trades stay on the open board so more can join until
    -- the poster completes them.
  else
    -- Single-claim open trade: the classic one partner.
    perform set_config('fresno_skillshare.trade_transition', 'on', true);
    update public.trades set partner_id = p_claimant_id, status = 'accepted' where id = p_trade_id;
    perform set_config('fresno_skillshare.trade_transition', 'off', true);
    insert into public.trade_participants (trade_id, member_id)
    values (p_trade_id, p_claimant_id) on conflict do nothing;
  end if;

  -- They are in the group now, not a pending claimant.
  delete from public.trade_claims where trade_id = p_trade_id and claimant_id = p_claimant_id;
end;
$$;

revoke all on function public.accept_trade_claimant(uuid, uuid) from public, anon;
grant execute on function public.accept_trade_claimant(uuid, uuid) to authenticated;

-- ---------- completion awards the whole group ----------

create or replace function public.confirm_trade_completion(p_trade_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
  v_multi boolean;
  v_group int;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;

  select * into t from public.trades where id = p_trade_id for update;
  if t.id is null then raise exception 'Trade not found'; end if;

  v_multi := (t.max_helpers is null or t.max_helpers <> 1);
  select count(*) into v_group from public.trade_participants where trade_id = p_trade_id;

  -- Who may complete: open/group trades are the poster's call (or admin);
  -- a direct 1:1 trade can be completed by either side (or admin).
  if t.was_open or v_multi then
    if auth.uid() <> t.proposer_id and not public.is_admin() then
      raise exception 'Only the member who posted this trade can mark it completed';
    end if;
  else
    if auth.uid() not in (t.proposer_id, t.partner_id) and not public.is_admin() then
      raise exception 'Only the two members in this trade or an admin can mark it completed';
    end if;
  end if;

  -- Readiness: a group needs at least one helper; a 1:1 needs to be accepted.
  if v_multi then
    if v_group < 1 then raise exception 'No one has joined this trade yet'; end if;
  else
    if t.status <> 'accepted' then
      raise exception 'Trade must be accepted before it can be completed';
    end if;
  end if;

  perform set_config('fresno_skillshare.trade_transition', 'on', true);
  update public.trades set status = 'completed', completed_at = now() where id = p_trade_id;
  perform set_config('fresno_skillshare.trade_transition', 'off', true);

  -- The proposer plus everyone who helped, deduped, each earn the badge.
  with recips as (
    select t.proposer_id as uid
    union
    select t.partner_id where t.partner_id is not null
    union
    select tp.member_id from public.trade_participants tp where tp.trade_id = p_trade_id
  )
  insert into public.badges (user_id, trade_id, label, awarded_by)
  select distinct uid, p_trade_id, t.title, auth.uid() from recips where uid is not null;
end;
$$;

revoke all on function public.confirm_trade_completion(uuid) from public, anon;
grant execute on function public.confirm_trade_completion(uuid) to authenticated;

-- ---------- leaderboard: count group helpers as counterparties ----------

create or replace view public.leaderboard
with (security_invoker = on) as
select
  p.id, p.display_name, p.avatar_url, p.location,
  coalesce(r.avg_rating, 0)::numeric(3, 2) as avg_rating,
  coalesce(r.review_count, 0) as review_count,
  coalesce(r.vouch_count, 0) as vouch_count,
  coalesce(t.completed_trades, 0) as completed_trades,
  coalesce(b.badge_count, 0) as badge_count,
  (
    round(coalesce(r.avg_rating, 0) * 10)
    + coalesce(r.vouch_count, 0) * 10
    + coalesce(t.completed_trades, 0) * 15
    + coalesce(b.badge_count, 0) * 5
  )::int as score
from public.profiles p
left join (
  select reviewee_id, avg(rating) as avg_rating, count(*) as review_count,
         count(*) filter (where vouch) as vouch_count
  from public.reviews group by reviewee_id
) r on r.reviewee_id = p.id
left join (
  select user_id, count(distinct partner) as completed_trades from (
    select proposer_id as user_id, partner_id as partner
    from public.trades where status = 'completed' and partner_id is not null
    union
    select partner_id as user_id, proposer_id as partner
    from public.trades where status = 'completed' and partner_id is not null
    union
    select tr.proposer_id as user_id, tp.member_id as partner
    from public.trades tr join public.trade_participants tp on tp.trade_id = tr.id
    where tr.status = 'completed'
    union
    select tp.member_id as user_id, tr.proposer_id as partner
    from public.trades tr join public.trade_participants tp on tp.trade_id = tr.id
    where tr.status = 'completed'
  ) x
  where user_id is not null and partner is not null and user_id <> partner
  group by user_id
) t on t.user_id = p.id
left join (
  select bd.user_id,
    count(distinct case when tr.proposer_id = bd.user_id then tr.partner_id else tr.proposer_id end)
      as badge_count
  from public.badges bd
  join public.trades tr on tr.id = bd.trade_id
  group by bd.user_id
) b on b.user_id = p.id
where p.status = 'active';

-- ---------- realtime ----------

do $$ begin
  alter publication supabase_realtime add table public.trade_participants;
exception when duplicate_object then null; end $$;
alter table public.trade_participants replica identity full;
