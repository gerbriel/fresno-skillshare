-- =============================================================
-- Fresno Skillshare - trust & safety
-- Run after 00022_security_hardening.sql. Idempotent / re-runnable.
--
--   A. Reviews/vouches require a completed trade between the pair.
--   B. Leaderboard scores by DISTINCT counterparties, so looping the
--      same partner (or a sockpuppet) counts once.
--   C. Member-created categories are hidden until an admin approves
--      them; admin-created ones are approved on the spot.
--   D. Contact messages can no longer be inserted directly by anon;
--      they must go through the submit-contact Edge Function, which
--      verifies a captcha token. Admins still read them.
--   E. Members can block each other (no messages either direction).
--   F. A member can share a conversation with admins for review.
-- =============================================================

-- ---------- A. reviews require a real completed trade ----------

create or replace function public.has_completed_trade_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trades
    where status = 'completed'
      and (
        (proposer_id = a and partner_id = b)
        or (proposer_id = b and partner_id = a)
      )
  );
$$;

drop policy if exists "Members write own reviews" on public.reviews;
create policy "Members write own reviews"
  on public.reviews for insert
  with check (
    reviewer_id = auth.uid()
    and public.is_active_member()
    and public.has_completed_trade_between(auth.uid(), reviewee_id)
  );

-- ---------- B. leaderboard: distinct counterparties ----------

create or replace view public.leaderboard
with (security_invoker = on) as
select
  p.id,
  p.display_name,
  p.avatar_url,
  p.location,
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
  -- distinct partners completed with, not raw completed rows
  select user_id, count(distinct partner) as completed_trades from (
    select proposer_id as user_id, partner_id as partner
    from public.trades where status = 'completed' and partner_id is not null
    union
    select partner_id as user_id, proposer_id as partner
    from public.trades where status = 'completed' and partner_id is not null
  ) x group by user_id
) t on t.user_id = p.id
left join (
  -- badges credited by distinct counterparty as well
  select bd.user_id,
    count(distinct case when tr.proposer_id = bd.user_id then tr.partner_id else tr.proposer_id end)
      as badge_count
  from public.badges bd
  join public.trades tr on tr.id = bd.trade_id
  group by bd.user_id
) b on b.user_id = p.id
where p.status = 'active';

-- ---------- C. member categories need admin approval ----------

alter table public.categories
  add column if not exists approved boolean not null default false;

-- Everything that exists today (seeds + anything an admin already made)
-- stays visible.
update public.categories set approved = true where approved = false;

-- Member inserts land unapproved (the default); admin inserts are
-- auto-approved by this trigger. Members cannot self-approve because
-- the UPDATE policy is admin-only.
create or replace function public.set_category_approval()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.approved := public.is_admin();
  return new;
end;
$$;

drop trigger if exists set_category_approval on public.categories;
create trigger set_category_approval before insert on public.categories
  for each row execute function public.set_category_approval();

-- Public/members see approved categories; you also see your own pending
-- ones; admins see everything (the approval queue).
drop policy if exists "Anyone views categories" on public.categories;
drop policy if exists "Members view categories" on public.categories;
create policy "Anyone views approved categories"
  on public.categories for select
  to anon, authenticated
  using (approved or created_by = auth.uid() or public.is_admin());

-- Only count listings in approved categories toward the public tallies.
create or replace function public.category_counts()
returns table (category_id uuid, listing_type text, n bigint)
language sql stable security definer
set search_path = public
as $$
  select l.category_id, l.type, count(*)
  from public.listings l
  join public.categories c on c.id = l.category_id
  where l.status = 'active' and c.approved
  group by l.category_id, l.type;
$$;

-- ---------- D. contact form must go through the verified function ----------

-- Direct anon inserts are removed; the submit-contact Edge Function
-- (service role) is now the only writer, after it checks the captcha.
drop policy if exists "Anyone can send a contact message" on public.contact_messages;

-- ---------- E. member blocking ----------

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

-- You can see and manage only the blocks you created. Who blocked YOU
-- is deliberately not readable.
drop policy if exists "Members see own blocks" on public.blocks;
create policy "Members see own blocks"
  on public.blocks for select using (blocker_id = auth.uid());

drop policy if exists "Members create own blocks" on public.blocks;
create policy "Members create own blocks"
  on public.blocks for insert
  with check (blocker_id = auth.uid() and public.is_active_member());

drop policy if exists "Members delete own blocks" on public.blocks;
create policy "Members delete own blocks"
  on public.blocks for delete using (blocker_id = auth.uid());

create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- No new thread with someone either of you has blocked.
drop policy if exists "Members start threads" on public.message_threads;
create policy "Members start threads"
  on public.message_threads for insert
  with check (
    a_id = auth.uid()
    and public.is_active_member()
    and not public.blocked_between(a_id, b_id)
  );

-- No new messages once a block exists in either direction.
drop policy if exists "Participants send messages" on public.messages;
create policy "Participants send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.message_threads t
      where t.id = thread_id and (t.a_id = auth.uid() or t.b_id = auth.uid())
        and not public.blocked_between(t.a_id, t.b_id)
    )
  );

-- ---------- F. share a conversation with admins ----------

alter table public.message_threads
  add column if not exists reported_by uuid references public.profiles(id) on delete set null,
  add column if not exists reported_at timestamptz;

-- A participant opts their own thread in (or back out) for admin review.
create or replace function public.report_thread(p_thread_id uuid, p_report boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  update public.message_threads
  set reported_by = case when p_report then auth.uid() else null end,
      reported_at = case when p_report then now() else null end
  where id = p_thread_id and (a_id = auth.uid() or b_id = auth.uid());
  if not found then
    raise exception 'Conversation not found';
  end if;
end;
$$;

revoke all on function public.report_thread(uuid, boolean) from public, anon;
grant execute on function public.report_thread(uuid, boolean) to authenticated;

-- Admins can read a thread and its messages only once a participant
-- has shared it.
drop policy if exists "Participants view threads" on public.message_threads;
create policy "Participants view threads"
  on public.message_threads for select
  using (
    a_id = auth.uid()
    or b_id = auth.uid()
    or (public.is_admin() and reported_by is not null)
  );

drop policy if exists "Participants view messages" on public.messages;
create policy "Participants view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.message_threads t
      where t.id = thread_id and (t.a_id = auth.uid() or t.b_id = auth.uid())
    )
    or (
      public.is_admin() and exists (
        select 1 from public.message_threads t
        where t.id = thread_id and t.reported_by is not null
      )
    )
  );
