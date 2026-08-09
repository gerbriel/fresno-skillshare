-- =============================================================
-- Fresno Skillshare - members can add categories; re-seed standards
-- Run after 00018_trade_completion_rules.sql.
-- Safe to run more than once: every statement is idempotent.
--
--   * Any active member can now create a category (name, description,
--     icon). Editing and deleting stay admin-only, so admins can
--     rename, merge, or remove what members add. Creation is rate
--     limited and tracked via created_by.
--   * The standard categories are re-seeded idempotently: any that
--     were deleted during testing come back; existing rows are left
--     exactly as they are.
-- =============================================================

alter table public.categories
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

drop policy if exists "Admins create categories" on public.categories;
drop policy if exists "Active members create categories" on public.categories;
create policy "Active members create categories"
  on public.categories for insert
  with check (public.is_active_member() or public.is_admin());

drop trigger if exists rl_categories on public.categories;
create trigger rl_categories before insert on public.categories
  for each row execute function public.rate_limit_trigger('categories', '5', '3600');

-- Restore any missing standard categories. Bare ON CONFLICT catches
-- both unique constraints (name and slug), so renamed or customized
-- rows are never touched or duplicated.
insert into public.categories (name, slug, description, icon) values
  ('Home and Repairs', 'home-repairs', 'Handyman work, plumbing, electrical, painting', 'wrench'),
  ('Food and Garden', 'food-garden', 'Produce, baked goods, gardening, canning', 'carrot'),
  ('Skills and Lessons', 'skills-lessons', 'Tutoring, music lessons, language exchange', 'graduation-cap'),
  ('Creative and Design', 'creative-design', 'Art, photography, graphic design, writing', 'palette'),
  ('Tech Help', 'tech-help', 'Computer repair, web help, phone setup', 'laptop'),
  ('Childcare and Errands', 'childcare-errands', 'Babysitting, rides, pickups, pet care', 'car'),
  ('Goods and Equipment', 'goods-equipment', 'Tools, furniture, clothing, equipment loans', 'package')
on conflict do nothing;

-- Sanity check: you should see all seven standard slugs plus any
-- custom categories.
select name, slug, icon from public.categories order by name;
