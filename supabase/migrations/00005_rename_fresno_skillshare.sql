-- ============================================================
-- Fresno Skillshare - rename from "Barter Fresno"
-- ============================================================
-- The hero_subheading seeded by 00001_init.sql is live data in
-- site_settings, so already-deployed databases keep the old name
-- until updated. Only replace it if the admin has not customized
-- it since the original seed.

update public.site_settings
set value = '"Fresno Skillshare is an invite-only co-op where neighbors trade goods and services directly. No money, just mutual help and community credit."'::jsonb,
    updated_at = now()
where key = 'hero_subheading'
  and value = '"Barter Fresno is an invite-only co-op where neighbors trade goods and services directly. No money, just mutual help and community credit."'::jsonb;
