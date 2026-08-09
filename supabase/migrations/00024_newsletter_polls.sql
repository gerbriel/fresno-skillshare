-- =============================================================
-- Fresno Skillshare - polls attached to admin newsletters
-- Run after 00023_trust_and_safety.sql. Idempotent / re-runnable.
--
-- An admin can attach a poll (question + options) to a newsletter.
-- Members vote from the Co-op news page (/news); votes are anonymous
-- and the running tally is always visible. One vote per member,
-- changeable.
--
-- Anonymity: a member can read only their OWN vote row (to highlight
-- their pick). Everyone sees aggregate counts via poll_results_multi,
-- a SECURITY DEFINER function that returns counts without identities.
-- =============================================================

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid references public.newsletters(id) on delete cascade,
  question text not null check (btrim(question) <> '' and char_length(question) <= 200),
  created_by uuid references public.profiles(id) on delete set null,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists polls_newsletter_idx on public.polls (newsletter_id);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (btrim(label) <> '' and char_length(label) <= 100),
  position int not null default 0
);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id, position);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, voter_id)
);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- Members see polls/options only on SENT newsletters; admins see all
-- (so drafts stay private until sent).
drop policy if exists "View polls on sent newsletters" on public.polls;
create policy "View polls on sent newsletters"
  on public.polls for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.newsletters n
      where n.id = polls.newsletter_id and n.status = 'sent'
    )
  );

drop policy if exists "View options on sent newsletters" on public.poll_options;
create policy "View options on sent newsletters"
  on public.poll_options for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.polls p
      join public.newsletters n on n.id = p.newsletter_id
      where p.id = poll_options.poll_id and n.status = 'sent'
    )
  );

-- A member can read only their own vote. Everyone gets aggregate
-- counts through the function below, so tallies never reveal who voted.
drop policy if exists "Read own vote" on public.poll_votes;
create policy "Read own vote"
  on public.poll_votes for select
  using (voter_id = auth.uid());

-- ---------- admin: attach/replace a poll on a draft newsletter ----------

create or replace function public.upsert_newsletter_poll(
  p_newsletter_id uuid,
  p_question text,
  p_options text[]
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_poll_id uuid;
  v_opt text;
  v_pos int := 0;
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage polls';
  end if;
  if not exists (select 1 from public.newsletters where id = p_newsletter_id and status = 'draft') then
    raise exception 'You can only edit a poll on a draft newsletter';
  end if;

  -- Empty question means "no poll": remove any existing one.
  if btrim(coalesce(p_question, '')) = '' then
    delete from public.polls where newsletter_id = p_newsletter_id;
    return null;
  end if;

  select id into v_poll_id from public.polls where newsletter_id = p_newsletter_id;
  if v_poll_id is null then
    insert into public.polls (newsletter_id, question, created_by)
    values (p_newsletter_id, left(btrim(p_question), 200), auth.uid())
    returning id into v_poll_id;
  else
    update public.polls set question = left(btrim(p_question), 200) where id = v_poll_id;
    delete from public.poll_options where poll_id = v_poll_id;
  end if;

  foreach v_opt in array coalesce(p_options, '{}')
  loop
    if btrim(v_opt) <> '' then
      insert into public.poll_options (poll_id, label, position)
      values (v_poll_id, left(btrim(v_opt), 100), v_pos);
      v_pos := v_pos + 1;
    end if;
  end loop;

  select count(*) into v_count from public.poll_options where poll_id = v_poll_id;
  if v_count < 2 then
    raise exception 'A poll needs at least two options';
  end if;
  if v_count > 8 then
    raise exception 'A poll can have at most eight options';
  end if;

  return v_poll_id;
end;
$$;

revoke all on function public.upsert_newsletter_poll(uuid, text, text[]) from public, anon;
grant execute on function public.upsert_newsletter_poll(uuid, text, text[]) to authenticated;

-- ---------- member: cast / change a vote ----------

create or replace function public.cast_vote(p_poll_id uuid, p_option_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_active_member() then
    raise exception 'Only active members can vote';
  end if;
  if not exists (
    select 1 from public.poll_options o
    join public.polls p on p.id = o.poll_id
    join public.newsletters n on n.id = p.newsletter_id
    where o.id = p_option_id and o.poll_id = p_poll_id and n.status = 'sent'
  ) then
    raise exception 'That poll option is not available';
  end if;
  if exists (
    select 1 from public.polls
    where id = p_poll_id and closes_at is not null and closes_at < now()
  ) then
    raise exception 'This poll is closed';
  end if;

  perform public.enforce_rate_limit('cast_vote', 60, 3600);

  insert into public.poll_votes (poll_id, option_id, voter_id)
  values (p_poll_id, p_option_id, auth.uid())
  on conflict (poll_id, voter_id)
  do update set option_id = excluded.option_id, created_at = now();
end;
$$;

revoke all on function public.cast_vote(uuid, uuid) from public, anon;
grant execute on function public.cast_vote(uuid, uuid) to authenticated;

-- ---------- aggregate counts (anonymous), batched by poll ----------

create or replace function public.poll_results_multi(p_poll_ids uuid[])
returns table (poll_id uuid, option_id uuid, votes bigint)
language sql stable security definer set search_path = public
as $$
  select v.poll_id, v.option_id, count(*)
  from public.poll_votes v
  where v.poll_id = any(p_poll_ids)
  group by v.poll_id, v.option_id;
$$;
