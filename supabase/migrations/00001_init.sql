-- =============================================================
-- Barter Fresno - initial schema
-- Run this in the Supabase SQL editor (or via supabase db push).
--
-- Security model:
--   * Every table has Row Level Security enabled.
--   * Membership is gated by profiles.status = 'active'.
--   * Admins are profiles.role = 'admin'.
--   * All authorization happens in the database, so changing a URL
--     in the client can never expose another user's private data.
--
-- Patterns borrowed from sibling projects:
--   * Reviews: Watrloo's review component repurposed for members
--     (overall rating + optional sub-scores, one review per pair,
--     edit-as-upsert), with vouches added for social credit.
--   * Messaging/newsletter: 559flawless's threaded inbox with
--     denormalized rollups and an in-app broadcast RPC.
-- =============================================================

-- ---------- helper functions ----------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.is_active_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

-- ---------- profiles ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New member',
  avatar_url text,
  bio text,
  location text default 'Fresno, CA',
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Members can view active profiles"
  on public.profiles for select
  using (
    id = auth.uid()
    or public.is_admin()
    or (public.is_active_member() and status = 'active')
  );

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Prevent members from escalating their own role/status.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;

create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ---------- invites and join requests ----------

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create unique index invites_email_unused on public.invites (lower(email)) where used_at is null;

alter table public.invites enable row level security;

create policy "Admins manage invites"
  on public.invites for all
  using (public.is_admin())
  with check (public.is_admin());

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);

alter table public.join_requests enable row level security;

-- Anyone (even signed out) can ask to join. Only admins can read or update.
create policy "Anyone can request to join"
  on public.join_requests for insert
  to anon, authenticated
  with check (status = 'pending' and reviewed_by is null and reviewed_at is null);

create policy "Admins read join requests"
  on public.join_requests for select
  using (public.is_admin());

create policy "Admins update join requests"
  on public.join_requests for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete join requests"
  on public.join_requests for delete
  using (public.is_admin());

-- New signups: active immediately if their email has an unused invite,
-- otherwise they wait in 'pending' until an admin approves them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  invite_id uuid;
begin
  select id into invite_id
  from public.invites
  where lower(email) = lower(new.email) and used_at is null
  limit 1;

  insert into public.profiles (id, display_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    case when invite_id is not null then 'active' else 'pending' end
  );

  if invite_id is not null then
    update public.invites set used_at = now() where id = invite_id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- categories ----------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  emoji text default '🔁',
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Members view categories"
  on public.categories for select
  using (public.is_active_member() or public.is_admin());

create policy "Admins create categories"
  on public.categories for insert with check (public.is_admin());
create policy "Admins update categories"
  on public.categories for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete categories"
  on public.categories for delete using (public.is_admin());

-- ---------- listings (goods/services offered or sought) ----------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('offering', 'seeking')),
  kind text not null default 'service' check (kind in ('service', 'good')),
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused')),
  duplicated_from uuid references public.listings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listings_owner_idx on public.listings (owner_id);
create index listings_category_idx on public.listings (category_id);

alter table public.listings enable row level security;

create policy "Members view listings"
  on public.listings for select
  using (public.is_active_member() or public.is_admin());

create policy "Members create own listings"
  on public.listings for insert
  with check (owner_id = auth.uid() and public.is_active_member());

create policy "Owners and admins update listings"
  on public.listings for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

create policy "Owners and admins delete listings"
  on public.listings for delete
  using (owner_id = auth.uid() or public.is_admin());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();

-- ---------- trades and trade tasks ----------

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'completed', 'declined')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (proposer_id <> partner_id)
);
create index trades_proposer_idx on public.trades (proposer_id);
create index trades_partner_idx on public.trades (partner_id);

alter table public.trades enable row level security;

create policy "Participants view trades"
  on public.trades for select
  using (proposer_id = auth.uid() or partner_id = auth.uid() or public.is_admin());

create policy "Members propose trades"
  on public.trades for insert
  with check (proposer_id = auth.uid() and public.is_active_member());

-- Completion flows through confirm_trade_completion(); participants edit the rest.
create policy "Participants update trades"
  on public.trades for update
  using (proposer_id = auth.uid() or partner_id = auth.uid() or public.is_admin())
  with check (proposer_id = auth.uid() or partner_id = auth.uid() or public.is_admin());

create policy "Proposer or admin deletes trades"
  on public.trades for delete
  using ((proposer_id = auth.uid() and status = 'proposed') or public.is_admin());

create table public.trade_tasks (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index trade_tasks_trade_idx on public.trade_tasks (trade_id);

alter table public.trade_tasks enable row level security;

create policy "Participants manage trade tasks"
  on public.trade_tasks for all
  using (exists (
    select 1 from public.trades t
    where t.id = trade_id
      and (t.proposer_id = auth.uid() or t.partner_id = auth.uid() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.trades t
    where t.id = trade_id
      and (t.proposer_id = auth.uid() or t.partner_id = auth.uid() or public.is_admin())
  ));

-- ---------- badges ----------

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete set null,
  label text not null,
  awarded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index badges_user_idx on public.badges (user_id);

alter table public.badges enable row level security;

create policy "Members view badges"
  on public.badges for select
  using (public.is_active_member() or public.is_admin());

-- Badges are only granted through confirm_trade_completion() below.
create policy "Admins manage badges"
  on public.badges for all
  using (public.is_admin())
  with check (public.is_admin());

-- The partner in a trade confirms completion. This is the only path that
-- marks a trade complete and awards the badge, so nobody can self-award.
create or replace function public.confirm_trade_completion(p_trade_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
  unfinished int;
begin
  select * into t from public.trades where id = p_trade_id;
  if t.id is null then
    raise exception 'Trade not found';
  end if;
  if auth.uid() <> t.partner_id then
    raise exception 'Only the trade partner can confirm completion';
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
  values (t.proposer_id, t.id, t.title, t.partner_id);
end;
$$;

-- ---------- reviews (Watrloo's review component, repurposed for members) ----------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  reliability smallint check (reliability between 1 and 5),
  quality smallint check (quality between 1 and 5),
  communication smallint check (communication between 1 and 5),
  vouch boolean not null default false,
  body text check (char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id)
);
create index reviews_reviewee_idx on public.reviews (reviewee_id, created_at desc);

alter table public.reviews enable row level security;

create policy "Members view reviews"
  on public.reviews for select
  using (public.is_active_member() or public.is_admin());

create policy "Members write own reviews"
  on public.reviews for insert
  with check (reviewer_id = auth.uid() and public.is_active_member());

create policy "Reviewers update own reviews"
  on public.reviews for update
  using (reviewer_id = auth.uid() or public.is_admin())
  with check (reviewer_id = auth.uid() or public.is_admin());

create policy "Reviewers and admins delete reviews"
  on public.reviews for delete
  using (reviewer_id = auth.uid() or public.is_admin());

create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- ---------- messaging (559flawless threaded inbox, peer-to-peer) ----------

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  subject text,
  a_id uuid not null references public.profiles(id) on delete cascade,
  b_id uuid not null references public.profiles(id) on delete cascade,
  is_broadcast boolean not null default false,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_message_from uuid,
  a_unread boolean not null default false,
  b_unread boolean not null default false,
  created_at timestamptz not null default now(),
  check (a_id <> b_id)
);
create index threads_a_idx on public.message_threads (a_id, last_message_at desc);
create index threads_b_idx on public.message_threads (b_id, last_message_at desc);

alter table public.message_threads enable row level security;

create policy "Participants view threads"
  on public.message_threads for select
  using (a_id = auth.uid() or b_id = auth.uid());

create policy "Members start threads"
  on public.message_threads for insert
  with check (a_id = auth.uid() and public.is_active_member());

create policy "Participants update threads"
  on public.message_threads for update
  using (a_id = auth.uid() or b_id = auth.uid())
  with check (a_id = auth.uid() or b_id = auth.uid());

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 8000),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

alter table public.messages enable row level security;

create policy "Participants view messages"
  on public.messages for select
  using (exists (
    select 1 from public.message_threads t
    where t.id = thread_id and (t.a_id = auth.uid() or t.b_id = auth.uid())
  ));

create policy "Participants send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.message_threads t
      where t.id = thread_id and (t.a_id = auth.uid() or t.b_id = auth.uid())
    )
  );

-- Denormalized rollup: the inbox list never joins to messages.
create or replace function public.message_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.message_threads
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 120),
      last_message_from = new.sender_id,
      a_unread = case when new.sender_id = b_id then true else a_unread end,
      b_unread = case when new.sender_id = a_id then true else b_unread end
  where id = new.thread_id;
  return new;
end;
$$;

create trigger message_after_insert
  after insert on public.messages
  for each row execute function public.message_after_insert();

-- realtime for the thread view
alter publication supabase_realtime add table public.messages;

-- ---------- newsletters (in-app broadcast: one thread per member) ----------

create table public.newsletters (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  recipient_count int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.newsletters enable row level security;

create policy "Members read sent newsletters"
  on public.newsletters for select
  using ((public.is_active_member() and status = 'sent') or public.is_admin());

create policy "Admins create newsletters"
  on public.newsletters for insert with check (public.is_admin());
create policy "Admins update newsletters"
  on public.newsletters for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete newsletters"
  on public.newsletters for delete using (public.is_admin());

-- Delivers the newsletter into every active member's inbox as its own
-- thread, so replies come back to the admin as ordinary conversations.
create or replace function public.send_newsletter(p_newsletter_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  n public.newsletters;
  member record;
  thread_id uuid;
  sent int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can send newsletters';
  end if;

  select * into n from public.newsletters where id = p_newsletter_id;
  if n.id is null then
    raise exception 'Newsletter not found';
  end if;
  if n.status <> 'draft' then
    raise exception 'Newsletter was already sent';
  end if;

  for member in
    select id from public.profiles
    where status = 'active' and id <> auth.uid()
  loop
    insert into public.message_threads (subject, a_id, b_id, is_broadcast)
    values (n.subject, auth.uid(), member.id, true)
    returning id into thread_id;

    insert into public.messages (thread_id, sender_id, body)
    values (thread_id, auth.uid(), n.body);

    sent := sent + 1;
  end loop;

  update public.newsletters
  set status = 'sent', sent_at = now(), recipient_count = sent, author_id = auth.uid()
  where id = p_newsletter_id;

  return jsonb_build_object('sent', sent);
end;
$$;

-- ---------- site settings (public landing page content) ----------

create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

create policy "Anyone reads site settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

create policy "Admins create site settings"
  on public.site_settings for insert with check (public.is_admin());
create policy "Admins update site settings"
  on public.site_settings for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete site settings"
  on public.site_settings for delete using (public.is_admin());

insert into public.site_settings (key, value) values
  ('hero_heading', '"Trade skills, not dollars."'),
  ('hero_subheading', '"Barter Fresno is an invite-only co-op where neighbors trade goods and services directly. No money, just mutual help and community credit."'),
  ('about', '"We are a Fresno community cooperative. Members list what they can offer and what they are looking for, then trade directly with each other. Reputation is built through reviews, vouches, and completed trades."'),
  ('how_it_works', '["Get invited by a member or request to join.", "List the goods or services you offer and what you are seeking.", "Browse the feed, match with a neighbor, and propose a trade.", "Complete the trade, check off the tasks, and earn badges.", "Review and vouch for each other to build community credit."]');

-- ---------- leaderboard ----------

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
  select user_id, count(*) as completed_trades from (
    select proposer_id as user_id from public.trades where status = 'completed'
    union all
    select partner_id as user_id from public.trades where status = 'completed'
  ) x group by user_id
) t on t.user_id = p.id
left join (
  select user_id, count(*) as badge_count from public.badges group by user_id
) b on b.user_id = p.id
where p.status = 'active';

-- ---------- seed categories ----------

insert into public.categories (name, slug, description, emoji) values
  ('Home and Repairs', 'home-repairs', 'Handyman work, plumbing, electrical, painting', '🔧'),
  ('Food and Garden', 'food-garden', 'Produce, baked goods, gardening, canning', '🥕'),
  ('Skills and Lessons', 'skills-lessons', 'Tutoring, music lessons, language exchange', '🎓'),
  ('Creative and Design', 'creative-design', 'Art, photography, graphic design, writing', '🎨'),
  ('Tech Help', 'tech-help', 'Computer repair, web help, phone setup', '💻'),
  ('Childcare and Errands', 'childcare-errands', 'Babysitting, rides, pickups, pet care', '🚗'),
  ('Goods and Equipment', 'goods-equipment', 'Tools, furniture, clothing, equipment loans', '📦');
