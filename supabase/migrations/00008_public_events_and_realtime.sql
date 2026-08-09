-- =============================================================
-- Fresno Skillshare - public events + live updates everywhere
-- Run after 00007_open_trades.sql.
--
--   * Events become publicly readable so visitors on the landing
--     page can see the next public meeting and show up. Writing
--     them is still admin-only.
--   * Every table the app renders joins the realtime publication,
--     so an admin approving a member, publishing an event, or
--     sending a newsletter shows up without a refresh.
--
-- Realtime still honors RLS: a subscriber is only sent changes to
-- rows its policies already let it read. Making events public here
-- is what lets signed-out visitors receive event updates too.
-- =============================================================

-- ---------- events are public ----------

drop policy "Members view events" on public.events;
create policy "Anyone can read events"
  on public.events for select
  to anon, authenticated
  using (true);

-- ---------- realtime ----------

-- Add every table the UI renders, skipping any already published so
-- this migration stays re-runnable.
do $$
declare
  t text;
  wanted text[] := array[
    'profiles',        -- approval/suspension takes effect live
    'listings',
    'categories',
    'events',
    'newsletters',
    'message_threads', -- inbox list and unread badge
    'messages',
    'trades',          -- open board: a claim disappears for everyone
    'trade_tasks',
    'reviews',
    'badges',
    'join_requests',   -- admin queue
    'invites',
    'site_settings'    -- landing page copy edits go live
  ];
begin
  foreach t in array wanted loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- Ship the whole old row on update/delete. Without this the payload
-- carries only the primary key, which is not enough for realtime to
-- evaluate RLS on the row that just disappeared, so subscribers can
-- silently miss deletions.
alter table public.profiles replica identity full;
alter table public.listings replica identity full;
alter table public.categories replica identity full;
alter table public.events replica identity full;
alter table public.newsletters replica identity full;
alter table public.message_threads replica identity full;
alter table public.trades replica identity full;
alter table public.trade_tasks replica identity full;
alter table public.reviews replica identity full;
alter table public.badges replica identity full;
alter table public.join_requests replica identity full;
alter table public.invites replica identity full;
alter table public.site_settings replica identity full;
