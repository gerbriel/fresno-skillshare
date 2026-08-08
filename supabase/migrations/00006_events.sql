-- =============================================================
-- Fresno Skillshare - community events
-- Run after 00005_rename_fresno_skillshare.sql.
--
-- Admins publish events (potlucks, repair cafes, skill swaps);
-- every active member can see where and when they happen and any
-- notes about them. Same moderation model as categories:
-- admin-only writes, member-only reads, enforced by RLS.
--
-- Events deliberately carry no author column, so account deletion
-- (00004) never needs to touch them.
-- =============================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_len check (btrim(title) <> '' and char_length(title) <= 140),
  constraint events_location_len check (location is null or char_length(location) <= 200),
  constraint events_notes_len check (notes is null or char_length(notes) <= 5000),
  constraint events_time_order check (ends_at is null or ends_at >= starts_at)
);
create index events_starts_idx on public.events (starts_at);

alter table public.events enable row level security;

create policy "Members view events"
  on public.events for select
  using (public.is_active_member() or public.is_admin());

create policy "Admins create events"
  on public.events for insert with check (public.is_admin());
create policy "Admins update events"
  on public.events for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete events"
  on public.events for delete using (public.is_admin());

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
