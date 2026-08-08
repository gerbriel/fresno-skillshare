-- =============================================================
-- Fresno Skillshare - production hardening
-- Run after 00001_init.sql.
--
--   * Rate limiting enforced in the database (triggers), keyed by
--     auth.uid() for members and x-real-ip for anonymous writes.
--     Admins are exempt so newsletter fan-out and moderation work.
--   * Length and format CHECK constraints on every free-text column
--     (client maxLength is UX; these are the real boundary).
--   * Atomic RPCs for multi-step writes that were previously two or
--     more round trips from the client.
--   * Indexes for feed ordering and trigram search.
-- =============================================================

-- ---------- rate limiting ----------

create table public.rate_limits (
  actor text not null,
  action text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (actor, action, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Fixed-window counter. Raises for the caller once the window is full.
create or replace function public.enforce_rate_limit(p_action text, p_max int, p_window_seconds int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_actor text;
  v_window timestamptz;
  v_count int;
begin
  if public.is_admin() then
    return;
  end if;

  v_actor := coalesce(
    auth.uid()::text,
    current_setting('request.headers', true)::jsonb ->> 'x-real-ip',
    'anon'
  );
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as rl (actor, action, window_start)
  values (v_actor, p_action, v_window)
  on conflict (actor, action, window_start)
  do update set count = rl.count + 1
  returning rl.count into v_count;

  if v_count > p_max then
    raise exception 'Rate limit exceeded. Please wait a moment and try again.';
  end if;

  -- Opportunistic cleanup of expired windows.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
end;
$$;

create or replace function public.rate_limit_trigger()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.enforce_rate_limit(tg_argv[0], tg_argv[1]::int, tg_argv[2]::int);
  return new;
end;
$$;

create trigger rl_messages before insert on public.messages
  for each row execute function public.rate_limit_trigger('messages', '30', '60');
create trigger rl_threads before insert on public.message_threads
  for each row execute function public.rate_limit_trigger('threads', '20', '3600');
create trigger rl_listings before insert on public.listings
  for each row execute function public.rate_limit_trigger('listings', '15', '3600');
create trigger rl_reviews before insert on public.reviews
  for each row execute function public.rate_limit_trigger('reviews', '20', '3600');
create trigger rl_trades before insert on public.trades
  for each row execute function public.rate_limit_trigger('trades', '10', '3600');
create trigger rl_trade_tasks before insert on public.trade_tasks
  for each row execute function public.rate_limit_trigger('trade_tasks', '120', '3600');
create trigger rl_join_requests before insert on public.join_requests
  for each row execute function public.rate_limit_trigger('join_requests', '5', '3600');

-- ---------- length and format constraints ----------

alter table public.profiles
  add constraint profiles_display_name_len check (btrim(display_name) <> '' and char_length(display_name) <= 80),
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 1000),
  add constraint profiles_location_len check (location is null or char_length(location) <= 120),
  add constraint profiles_avatar_url_shape check (
    avatar_url is null or (char_length(avatar_url) <= 500 and avatar_url ~* '^https?://')
  );

alter table public.join_requests
  add constraint join_requests_name_len check (btrim(name) <> '' and char_length(name) <= 120),
  add constraint join_requests_email_shape check (
    char_length(email) <= 320 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  add constraint join_requests_message_len check (message is null or char_length(message) <= 2000);

alter table public.invites
  add constraint invites_email_shape check (
    char_length(email) <= 320 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  add constraint invites_note_len check (note is null or char_length(note) <= 500);

alter table public.categories
  add constraint categories_name_len check (btrim(name) <> '' and char_length(name) <= 60),
  add constraint categories_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  add constraint categories_description_len check (description is null or char_length(description) <= 500),
  add constraint categories_icon_shape check (icon is null or (icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(icon) <= 40));

alter table public.listings
  add constraint listings_title_len check (btrim(title) <> '' and char_length(title) <= 140),
  add constraint listings_description_len check (description is null or char_length(description) <= 5000);

alter table public.trades
  add constraint trades_title_len check (btrim(title) <> '' and char_length(title) <= 140),
  add constraint trades_notes_len check (notes is null or char_length(notes) <= 2000);

alter table public.trade_tasks
  add constraint trade_tasks_title_len check (btrim(title) <> '' and char_length(title) <= 200);

alter table public.message_threads
  add constraint threads_subject_len check (subject is null or char_length(subject) <= 200);

-- messages.body <= 8000 and reviews.body <= 4000 already enforced in 00001.

alter table public.newsletters
  add constraint newsletters_subject_len check (btrim(subject) <> '' and char_length(subject) <= 200),
  add constraint newsletters_body_len check (btrim(body) <> '' and char_length(body) <= 20000);

alter table public.site_settings
  add constraint site_settings_value_len check (char_length(value::text) <= 20000);

-- Clamp the signup-provided display name so a long value can't fail the
-- profile insert and block account creation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  invite_id uuid;
  v_name text;
begin
  select id into invite_id
  from public.invites
  where lower(email) = lower(new.email) and used_at is null
  limit 1;

  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80);
  if v_name = '' then
    v_name := left(split_part(new.email, '@', 1), 80);
  end if;

  insert into public.profiles (id, display_name, status)
  values (
    new.id,
    v_name,
    case when invite_id is not null then 'active' else 'pending' end
  );

  if invite_id is not null then
    update public.invites set used_at = now() where id = invite_id;
  end if;

  return new;
end;
$$;

-- ---------- atomic write RPCs ----------

-- Trade + its task checklist in one transaction (was two client round
-- trips that could leave a trade with no tasks). Security invoker: the
-- inserts still pass through RLS and the rate-limit triggers.
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
  if p_partner_id = auth.uid() then
    raise exception 'You cannot propose a trade with yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_partner_id and status = 'active') then
    raise exception 'Trade partner not found';
  end if;
  if btrim(coalesce(p_title, '')) = '' or char_length(p_title) > 140 then
    raise exception 'Trade title is required (140 characters max)';
  end if;
  if coalesce(array_length(p_tasks, 1), 0) > 30 then
    raise exception 'A trade can have at most 30 tasks';
  end if;

  insert into public.trades (proposer_id, partner_id, title, notes)
  values (auth.uid(), p_partner_id, btrim(p_title), nullif(left(btrim(coalesce(p_notes, '')), 2000), ''))
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

-- Server-side copy for "duplicate to my profile": the copied text never
-- passes through the client, and only visible active listings qualify.
create or replace function public.duplicate_listing(p_listing_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_new_id uuid;
begin
  insert into public.listings (owner_id, category_id, type, kind, title, description, duplicated_from)
  select auth.uid(), category_id, type, kind, title, description, id
  from public.listings
  where id = p_listing_id and status = 'active'
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'Listing not found';
  end if;

  return v_new_id;
end;
$$;

-- Atomic multi-key settings save (was a client-side loop that could
-- fail halfway and race against concurrent editors).
create or replace function public.upsert_site_settings(p_settings jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit site settings';
  end if;
  if (select count(*) from jsonb_object_keys(p_settings)) > 20 then
    raise exception 'Too many settings in one save';
  end if;

  insert into public.site_settings (key, value, updated_at)
  select key, value, now() from jsonb_each(p_settings)
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

-- Approve a join request: invite + status flip in one transaction
-- (was two writes; a failure between them stranded the request).
create or replace function public.approve_join_request(p_request_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  r public.join_requests;
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

  insert into public.invites (email, invited_by, note)
  values (r.email, auth.uid(), 'Approved join request')
  on conflict (lower(email)) where used_at is null do nothing;

  update public.join_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;
end;
$$;

-- Aggregate for the categories page (was: fetch every listing row and
-- tally client-side). Security invoker, so RLS still gates visibility.
create or replace function public.category_counts()
returns table (category_id uuid, listing_type text, n bigint)
language sql stable
set search_path = public
as $$
  select l.category_id, l.type, count(*)
  from public.listings l
  where l.status = 'active' and l.category_id is not null
  group by l.category_id, l.type;
$$;

-- ---------- indexes for scale ----------

-- Feed default ordering: newest active listings first.
create index listings_status_created_idx on public.listings (status, created_at desc);

-- Trigram indexes so ilike '%term%' search stays fast as listings grow.
create extension if not exists pg_trgm;
create index listings_title_trgm_idx on public.listings using gin (title gin_trgm_ops);
create index listings_description_trgm_idx on public.listings using gin (description gin_trgm_ops);

-- Admin queues, newest first.
create index join_requests_status_created_idx on public.join_requests (status, created_at desc);
create index newsletters_created_idx on public.newsletters (created_at desc);
