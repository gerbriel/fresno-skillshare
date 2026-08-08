# Barter Fresno

An invite-only community co-op where Fresno neighbors trade goods and services directly. No money, just mutual help and community credit.

## Features

- **Public landing page** with admin-editable content and a request-to-join form
- **Invite-only membership**: sign up with an invited email for instant access, or wait for admin approval
- **Listings**: members post what they are offering and what they are seeking, by category, as services or goods
- **Duplicate to my profile**: see a listing similar to what you do and add it to your own profile in one click
- **Community feed** with search and filters, plus category pages showing who provides similar services
- **Reviews and vouches**: star rating with reliability, quality, and communication sub-scores, one review per member pair, edit anytime
- **Social credit and leaderboard**: score built from ratings, vouches, completed trades, and badges
- **Rank ladder**: from Newcomer to Co-op Legend, driven by completed trades
- **Trades with task checklists**: propose a trade, check off tasks, your partner confirms completion and you earn a badge on your profile
- **Realtime messaging** between members
- **Admin newsletter**: delivered in-app to every member's inbox, replies come back as private conversations
- **Admin dashboard**: members, join requests, invites, categories, listing moderation, newsletter, site content

## Security model

All authorization is enforced in the database with Postgres Row Level Security, not in the client:

- Every table has RLS enabled. Changing a URL or crafting an API call can never expose another member's private data.
- Membership is gated by `profiles.status = 'active'`. Pending and suspended accounts see nothing.
- Members can only write their own rows (listings, reviews, messages, trades). Admins are checked server-side via `is_admin()`.
- A database trigger blocks members from escalating their own role or status.
- Badges can only be granted through the `confirm_trade_completion` function, so nobody can self-award.
- Messages are only visible to the two participants, enforced on the realtime stream as well.

The React route guards are user experience only. The RLS policies in `supabase/migrations/00001_init.sql` are the real boundary.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- React Router v7
- Supabase: Postgres, Auth, Row Level Security, Realtime

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).

2. **Run the migration**: open the SQL editor in your Supabase dashboard and run the contents of `supabase/migrations/00001_init.sql`.

3. **Configure auth**: in Authentication settings, Email provider is enabled by default. For a smoother first run you can disable "Confirm email" so signups do not need email confirmation. Leave signups enabled: the schema gates access, uninvited signups just land in a pending state.

4. **Environment variables**:

   ```sh
   cp .env.example .env.local
   ```

   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Project Settings > API.

5. **Install and run**:

   ```sh
   npm install
   npm run dev
   ```

6. **Make yourself the first admin**: sign up in the app, then in the Supabase SQL editor run:

   ```sql
   update public.profiles
   set role = 'admin', status = 'active'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

   Sign out and back in. You now have the admin dashboard at `/admin`.

## How membership works

- **Invited**: an admin adds an email under Admin > Invites. When that person signs up with the same email, they are active immediately.
- **Request to join**: a visitor submits the form on the landing page. An admin approves it under Admin > Requests, which creates an invite for their email. They then sign up and get instant access.
- **Walk-in signup**: anyone can create an account, but it sits in pending until an admin approves it under Admin > Members.

## Notes

- Newsletters are delivered in-app, not by email. Each send creates a private message thread per member, so replies come back to the admin as normal conversations. Wiring up an email provider (for example Resend) is a possible later addition.
- The rank ladder lives in `src/lib/ranks.ts` on purpose: renaming ranks is a copy change, not a migration.
