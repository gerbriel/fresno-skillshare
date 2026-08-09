-- =============================================================
-- Fresno Skillshare - categories visible on the public landing page
-- Run after 00019_member_categories.sql.
--
-- The landing page shows the category grid with offering/seeking
-- tallies to visitors. Category names and per-category listing COUNTS
-- become public; listing contents, owners, and everything else stay
-- members-only exactly as before.
-- =============================================================

drop policy if exists "Members view categories" on public.categories;
drop policy if exists "Anyone views categories" on public.categories;
create policy "Anyone views categories"
  on public.categories for select
  to anon, authenticated
  using (true);

-- Security definer so visitors get the aggregate numbers without any
-- access to the listings themselves. Returns only category ids, the
-- listing type, and a count.
create or replace function public.category_counts()
returns table (category_id uuid, listing_type text, n bigint)
language sql stable security definer
set search_path = public
as $$
  select l.category_id, l.type, count(*)
  from public.listings l
  where l.status = 'active' and l.category_id is not null
  group by l.category_id, l.type;
$$;
