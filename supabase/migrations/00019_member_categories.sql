-- =============================================================
-- Fresno Skillshare - members can add categories; re-seed standards
-- Run after 00018_trade_completion_rules.sql.
-- Safe to run more than once: every statement is idempotent.
--
--   * enforce_rate_limit learns to recognize trusted server-side
--     contexts (SQL editor, migrations, service jobs): no signed-in
--     user AND no API request headers means nothing to rate limit.
--     API traffic is still limited exactly as before, by user id for
--     members and by IP for anonymous visitors.
--   * Any active member can now create a category (name, description,
--     icon). Editing and deleting stay admin-only. Creation is rate
--     limited and tracked via created_by.
--   * The standard categories are re-seeded idempotently.
-- =============================================================

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

  -- No auth context and no API request headers: this is the SQL
  -- editor, a migration, or another trusted server-side job.
  if auth.uid() is null and current_setting('request.headers', true) is null then
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

alter table public.categories
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

drop policy if exists "Admins create categories" on public.categories;
drop policy if exists "Active members create categories" on public.categories;
create policy "Active members create categories"
  on public.categories for insert
  with check (public.is_active_member() or public.is_admin());

-- Seed BEFORE the rate-limit trigger exists, so the seed itself can
-- never trip it. Bare ON CONFLICT catches both unique constraints
-- (name and slug), so renamed or customized rows are never touched.
drop trigger if exists rl_categories on public.categories;

insert into public.categories (name, slug, description, icon) values
  ('Home and Repairs', 'home-repairs', 'Handyman work, plumbing, electrical, painting', 'wrench'),
  ('Food and Garden', 'food-garden', 'Produce, baked goods, gardening, canning', 'carrot'),
  ('Skills and Lessons', 'skills-lessons', 'Tutoring, music lessons, language exchange', 'graduation-cap'),
  ('Creative and Design', 'creative-design', 'Art, photography, graphic design, writing', 'palette'),
  ('Tech Help', 'tech-help', 'Computer repair, web help, phone setup', 'laptop'),
  ('Childcare and Errands', 'childcare-errands', 'Babysitting, rides, pickups, pet care', 'car'),
  ('Goods and Equipment', 'goods-equipment', 'Tools, furniture, clothing, equipment loans', 'package')
on conflict do nothing;

create trigger rl_categories before insert on public.categories
  for each row execute function public.rate_limit_trigger('categories', '5', '3600');

-- Sanity check: you should see all seven standard slugs plus any
-- custom categories.
select name, slug, icon from public.categories order by name;
