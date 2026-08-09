-- =============================================================
-- Fresno Skillshare - recreate the signup trigger and heal orphans
-- Run after 00015_contact_messages.sql.
--
-- The on_auth_user_created trigger went missing on the live database
-- (most likely during account-deletion testing). Without it, new
-- signups get an auth user but NO profile row: they are stuck on the
-- "awaiting approval" screen, invisible in Admin > Members, and
-- unable to claim their invite.
--
-- This migration is idempotent: it recreates the trigger and then
-- creates the missing profile for every existing auth user, applying
-- the same invite logic signup would have applied.
-- =============================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Heal any auth user created while the trigger was missing.
do $$
declare
  u record;
  invite_id uuid;
  v_name text;
  v_avatar text;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    where not exists (select 1 from public.profiles p where p.id = au.id)
  loop
    select id into invite_id
    from public.invites
    where lower(email) = lower(u.email) and used_at is null
    limit 1;

    v_name := left(btrim(coalesce(
      u.raw_user_meta_data ->> 'display_name',
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      ''
    )), 80);
    if v_name = '' then
      v_name := left(split_part(u.email, '@', 1), 80);
    end if;

    v_avatar := left(coalesce(
      u.raw_user_meta_data ->> 'avatar_url',
      u.raw_user_meta_data ->> 'picture'
    ), 500);
    if v_avatar is null or v_avatar !~* '^https?://' then
      v_avatar := null;
    end if;

    insert into public.profiles (id, display_name, avatar_url, status)
    values (
      u.id,
      v_name,
      v_avatar,
      case when invite_id is not null then 'active' else 'pending' end
    );

    if invite_id is not null then
      update public.invites set used_at = now() where id = invite_id;
    end if;
  end loop;
end $$;
