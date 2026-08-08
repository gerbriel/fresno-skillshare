# Fresno Skillshare

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
- **Community events**: admins publish events (title, when, where, notes) under Admin > Events; every member sees upcoming and past events on the Events page
- **Admin dashboard**: members, join requests, invites, categories, listing moderation, events, newsletter, site content
- **Member moderation**: admins can approve, suspend, reactivate, or permanently delete accounts
- **GDPR account deletion**: members can delete their own account; personal data and listings are erased while messages, reviews, and trades shared with other members are kept anonymized as "Deleted member"
- **Legal pages**: public Privacy Policy (`/privacy`) and Terms & Conditions (`/terms`), linked from the landing page, sign-in, and member footer

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

2. **Run the migrations in order**: open the SQL editor in your Supabase dashboard and run the contents of `supabase/migrations/00001_init.sql`, then `00002_production_hardening.sql`, then `00003_google_auth.sql`, then `00004_account_deletion.sql`, then `00005_rename_fresno_skillshare.sql`, then `00006_events.sql`.

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

## Google sign-in

"Continue with Google" on the login page uses Supabase OAuth (PKCE flow). Google users go through the **same invite gate** as email signups: when their Google account's email has an unused invite, they are active immediately; otherwise their profile is created in `pending`, they see the "waiting for approval" page, and they appear in the admin queue under Admin > Members until approved (or left suspended). Their Google name and profile photo are used automatically.

One-time setup:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** (type: Web application).
   - Authorized JavaScript origins: `http://localhost:5173` and your production domain.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback` (shown in the Supabase dashboard on the Google provider page).
2. In Supabase, go to **Authentication > Providers > Google**, enable it, and paste the Client ID and Client Secret.
3. In **Authentication > URL Configuration**, set the Site URL to your app's domain and add redirect URLs for every place the app runs, e.g. `http://localhost:5173/**` and `https://yourdomain.com/**`. Without this the post-login redirect is refused.

## How membership works

- **Invited**: an admin adds an email under Admin > Invites. When that person signs up with the same email - password or Google - they are active immediately.
- **Request to join**: a visitor submits the form on the landing page. An admin approves it under Admin > Requests, which creates an invite for their email. They then sign up and get instant access.
- **Walk-in signup**: anyone can create an account (password or Google), but it sits in pending until an admin approves it under Admin > Members.

## Account deletion (GDPR erasure)

`supabase/migrations/00004_account_deletion.sql` implements "erase the person, keep the shared history":

- **Members** delete their own account from their profile page (type `delete` to confirm). **Admins** can delete any non-admin account under Admin > Members (type the member's name to confirm); suspend/reactivate remains the reversible option.
- **Erased**: the `auth.users` row (email, password hash, Google identity - deleting it also revokes every session, so the member is signed out of all devices), profile details (name, avatar, bio, location), all their listings, invites and join requests carrying their email, and rate-limit counters.
- **Kept, anonymized**: messages, reviews, vouches, trades, and trade tasks also belong to the other member in the exchange, so those rows stay and attribution joins resolve to a `'Deleted member'` tombstone profile with `status = 'deleted'`. Tombstones drop off the leaderboard, cannot be messaged or traded with, and hold no personal data.
- Guard rails: the only active admin cannot delete themself (make another admin first), and admins must remove another admin's role before deleting their account. Both entry points (`delete_my_account()`, `admin_delete_account(uuid)`) funnel into one `erase_account()` function that is not callable from the API.
- Because the `profiles -> auth.users` foreign key is dropped by this migration, delete accounts through the app, not the Supabase dashboard (a dashboard delete would leave a non-anonymized orphan profile).

The Privacy Policy (`src/pages/Privacy.tsx`) and Terms (`src/pages/Terms.tsx`) describe exactly this behavior - if you change what `erase_account()` touches, update both documents. The contact email and "last updated" date live in `src/components/LegalPage.tsx`.

## Production hardening

`supabase/migrations/00002_production_hardening.sql` adds the production layer on top of the schema. Everything security-relevant is enforced in the database, because the client can always be bypassed:

- **Rate limiting** runs in Postgres via `BEFORE INSERT` triggers: 30 messages/min, 15 listings/hr, 20 reviews/hr, 10 trades/hr, 20 new threads/hr per member, and 5 join requests/hr per IP for anonymous visitors. Admins are exempt (newsletter fan-out, moderation). Limits live in the trigger definitions in the migration.
- **Length and format constraints** on every free-text column (names, bios, listings, messages, notes), email format checks, and an `https?://` shape check on avatar URLs. The client mirrors these in `src/lib/validate.ts` for friendly feedback, but the CHECK constraints are the boundary.
- **Atomic RPCs** for multi-step writes: `create_trade_with_tasks`, `duplicate_listing`, `approve_join_request`, `upsert_site_settings`. Each is a single transaction, so a mid-write failure can no longer strand half the data.
- **Scale**: trigram indexes back the feed search, `category_counts()` aggregates in the database, and every list the client renders is paginated or capped.

Client-side patterns that pair with it:

- Optimistic rendering with rollback for message sends, listing status toggles, and task checkoffs; failed sends show a tap-to-retry bubble.
- Database errors are mapped to user-safe copy in `src/lib/errors.ts`; raw Postgres internals are never shown. Messages raised by our own functions (rate limits, RPC validation) pass through as-is.
- Avatar URLs render only if they parse as http(s); anything else falls back to initials.
- The public join form carries a honeypot field; bot submissions are accepted silently without writing anything.
- Routes are code-split, and an error boundary keeps a render crash from blanking the app.

Deploy notes:

- `vercel.json` (Vercel) and `public/_headers` + `public/_redirects` (Netlify) ship strict security headers - CSP locked to your Supabase project, HSTS, `frame-ancestors 'none'` - plus the SPA fallback rewrite. CORS is not the boundary for a public anon key; RLS is, and the CSP keeps the app itself from talking to anything but Supabase.
- In production, turn **"Confirm email" back on** (Authentication > Providers > Email) and set your **Site URL and redirect URLs** (Authentication > URL Configuration) to your deployed domain.
- Consider enabling **leaked password protection** and **CAPTCHA** under Authentication > Attack Protection for extra signup hardening.
- Compression (gzip/brotli) for both static assets and PostgREST JSON responses is handled by the Vercel/Netlify and Supabase edges automatically; the app's job is to not over-fetch, which the pagination and aggregate RPCs take care of.

## Notes

- Newsletters are delivered in-app, not by email. Each send creates a private message thread per member, so replies come back to the admin as normal conversations. Wiring up an email provider (for example Resend) is a possible later addition.
- The rank ladder lives in `src/lib/ranks.ts` on purpose: renaming ranks is a copy change, not a migration.
