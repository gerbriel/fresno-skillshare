-- =============================================================
-- Fresno Skillshare - Google (OAuth) sign-in support
-- Run after 00002_production_hardening.sql.
--
-- Google users flow through the SAME invite gate as email signups.
-- handle_new_user fires for every new auth user regardless of
-- provider: an unused invite matching their Google email activates
-- them instantly; otherwise the profile is created as 'pending' and
-- waits in the admin review queue (Admin > Members) while the user
-- sees the /pending page. This migration only teaches profile
-- creation to use the name and photo Google provides.
--
-- Dashboard setup (see README "Google sign-in"): enable the Google
-- provider under Authentication > Providers, and add your app URLs
-- to Authentication > URL Configuration.
-- =============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  invite_id uuid;
  v_name text;
  v_avatar text;
begin
  select id into invite_id
  from public.invites
  where lower(email) = lower(new.email) and used_at is null
  limit 1;

  -- Email signups send display_name; Google sends full_name / name.
  v_name := left(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), 80);
  if v_name = '' then
    v_name := left(split_part(new.email, '@', 1), 80);
  end if;

  -- Google provides a profile photo; keep it only if it is a real URL
  -- (the profiles_avatar_url_shape constraint would reject anything else).
  v_avatar := left(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  ), 500);
  if v_avatar is null or v_avatar !~* '^https?://' then
    v_avatar := null;
  end if;

  insert into public.profiles (id, display_name, avatar_url, status)
  values (
    new.id,
    v_name,
    v_avatar,
    case when invite_id is not null then 'active' else 'pending' end
  );

  if invite_id is not null then
    update public.invites set used_at = now() where id = invite_id;
  end if;

  return new;
end;
$$;
