# Fresno Skillshare

An invite-only community co-op where Fresno neighbors trade goods and services directly. No money, just mutual help and community credit.

## Features

- **Public landing page** with admin-editable content and a contact form with an admin inbox
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
- **Profile photo uploads**: members upload a photo from their device (resized client-side, stored in the Supabase `avatars` bucket, one object per member); admins can pull an inappropriate photo

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

2. **Run the migrations in order**: open the SQL editor in your Supabase dashboard and run every file in `supabase/migrations/` in filename order (`00001_init.sql` through the highest number).

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

- **Invited**: an admin adds an email under Admin > Invites, optionally with a role. When that person signs up with the same email - password or Google - they are active immediately, as a member or admin per the invite (`00017_invite_roles_and_purge.sql`).
- **Walk-in first**: creating an account is the front door. New signups land in 'pending'; an admin approves the account under Admin > Members, which emails the person a one-click sign-in link (see below).
- **Questions**: the landing page contact form lands in the admin dashboard (see "Contact form" below). The old join-requests table is kept for historical data only.
- **Order never matters**: invites are claimed at signup AND at sign-in (`supabase/migrations/00012_claim_invite_on_signin.sql`) - the pending page checks for a matching invite on load and on "Check again", so approving someone after they already signed up still lets them in.

## Approval and invitation emails

Two emails keep members in the loop, and failures never block the underlying action:

- **Approval** (Admin > Members > Approve): the `approve_member` RPC activates the pending account and the app sends them a **magic-link email** - one click signs them straight in. Customize Authentication > Email Templates > "Magic Link" so it reads as an approval notice (e.g. "You're in! Click to sign in to Fresno Skillshare").
- **Invitation** (Admin > Invites > Create invite): the `invite-member` Edge Function (`supabase/functions/invite-member/index.ts`) sends Supabase's "You have been invited" email. The link lands on `/welcome`, where the new member can set a password (optional - Google works too) and continue to the feed.

One-time setup:

1. **Deploy the function**: `supabase functions deploy invite-member --project-ref <your-project-ref>` (requires `supabase login` with the account that owns the project), or paste the file into the dashboard's Edge Functions editor. No secrets to configure - the function uses the automatically injected service role key and verifies the caller is an active admin before sending anything.
2. **Configure email sending**: Supabase's built-in sender is limited to a few emails per hour and is meant for testing. For production, set up custom SMTP under Project Settings > Authentication (Resend's free tier works well).
3. **Customize the template** (optional): Authentication > Email Templates > "Invite user". The redirect to `/welcome` is already covered by the `/**` entries in the Auth URL allow-list.

## Contact form

The landing page "Get in touch" form stores messages in the `contact_messages` table (migration `00015_contact_messages.sql`), and admins read, reply to (via a mailto link), and manage them under **Admin > Contact**. The Overview tab shows a "New messages" count.

Input safety is layered: the client trims input, strips control characters, and caps lengths; the database enforces the same limits with CHECK constraints plus a per-IP rate limit (5 messages/hour); a honeypot field silently drops most bots; and everything renders as plain text, never HTML.

## Trust & safety

Several protections keep the co-op honest and enforce the security boundary in the database (RLS), not the client:

- **Reviews require a real trade.** You can only review or vouch for a member you have a completed trade with (enforced by `has_completed_trade_between` in the reviews insert policy). This stops sockpuppet accounts farming reputation.
- **Reputation counts distinct partners.** The leaderboard scores completed trades and badges by *distinct counterparty*, so looping trades with the same person (or a second account) counts once.
- **Member categories need approval.** Members can propose categories, but they stay hidden from other members and the public until an admin approves them under Admin > Categories (pending queue at the top). Admin-created categories are auto-approved.
- **Blocking.** In a conversation, a member can Block another member; once blocked, no messages flow in either direction (enforced on the messages/threads insert policies). Manage from the conversation header.
- **Share a conversation with admins.** A participant can share a thread for review (`report_thread` RPC). Only then can admins read that specific thread, under Admin > Reports. Admins cannot read conversations that have not been shared.

## Newsletter polls

An admin can attach a poll to a newsletter from Admin > Newsletter: type a question and 2-8 options in the composer's "Poll (optional)" box (editable while the newsletter is a draft). Once the newsletter is sent, the poll appears beneath it on the members' Co-op news page (`/news`), where members vote with one tap.

Votes are **anonymous** and the running tally is **always visible** — a member sees the percentages and counts whether or not they have voted, but never who voted for what (counts come from the `poll_results_multi` SECURITY DEFINER function; the raw votes are readable only by the voter). One vote per member, changeable by tapping another option. Backed by `supabase/migrations/00024_newsletter_polls.sql` (`polls`, `poll_options`, `poll_votes`, plus the `upsert_newsletter_poll` and `cast_vote` RPCs).

## Security configuration (must-do)

These live in the Supabase dashboard, not the code, and the app's guarantees depend on them:

1. **Keep "Confirm email" ON** (Authentication > Providers > Email). If it is off, someone who learns an outstanding *admin* invite address could register it and be granted admin instantly. Invites and roles are matched by email, so the email must be verified.
2. **Enable Realtime authorization / RLS** so the message stream enforces the same row security as queries.
3. **Deploy the Edge Functions**: `supabase functions deploy invite-member` and `supabase functions deploy submit-contact`.

## Contact form captcha (Cloudflare Turnstile)

The public contact form now posts through the `submit-contact` Edge Function (the anon table insert was removed, closing spoofable spam). To turn on the free captcha:

1. Create a Turnstile widget at the Cloudflare dashboard (Turnstile). It gives a **site key** and a **secret key**.
2. Set `VITE_TURNSTILE_SITE_KEY=<site key>` in `.env.local` and in your host's env vars (rebuild/redeploy).
3. Set the secret on the function: `supabase secrets set TURNSTILE_SECRET_KEY=<secret key>` (or in the dashboard's Edge Function settings).

If the keys are unset the form still works, protected by rate limiting only; setting them enables captcha verification. The CSP already allows `challenges.cloudflare.com`.

## Account deletion (GDPR erasure)

`supabase/migrations/00004_account_deletion.sql` implements "erase the person, keep the shared history":

- **Members** delete their own account from their profile page (type `delete` to confirm). **Admins** can delete any non-admin account under Admin > Members (type the member's name to confirm); suspend/reactivate remains the reversible option.
- **Erased**: the `auth.users` row (email, password hash, Google identity - deleting it also revokes every session, so the member is signed out of all devices), profile details (name, avatar including the uploaded photo file, bio, location), all their listings, invites and join requests carrying their email, and rate-limit counters.
- **Kept, anonymized**: messages, reviews, vouches, trades, and trade tasks also belong to the other member in the exchange, so those rows stay and attribution joins resolve to a `'Deleted member'` tombstone profile with `status = 'deleted'`. Tombstones drop off the leaderboard, cannot be messaged or traded with, and hold no personal data.
- Tombstones can be **permanently removed** by an admin (Members > Remove permanently on a deleted row). This second step also cascades away the messages, reviews, trades, and threads attributed to the erased account - use it for test data, not routine deletions.
- Guard rails: the only active admin cannot delete themself (make another admin first), and admins must remove another admin's role before deleting their account. Both entry points (`delete_my_account()`, `admin_delete_account(uuid)`) funnel into one `erase_account()` function that is not callable from the API.
- Because the `profiles -> auth.users` foreign key is dropped by this migration, delete accounts through the app, not the Supabase dashboard (a dashboard delete would leave a non-anonymized orphan profile).

The Privacy Policy (`src/pages/Privacy.tsx`) and Terms (`src/pages/Terms.tsx`) describe exactly this behavior - if you change what `erase_account()` touches, update both documents. The contact point (Instagram: @fresno.skillshare) and "last updated" date live in `src/components/LegalPage.tsx`.

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

### Deploying to Vercel

The app is a static SPA, so there is nothing to configure in code: Vercel detects Vite, runs `npm run build`, and serves `dist`.

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Accept the detected Vite preset.

2. **Add the environment variables** under Settings > Environment Variables, for Production *and* Preview:

   ```
   VITE_SUPABASE_URL       https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY  <your anon public key>
   ```

   This step is not optional. `.env.local` is gitignored, so without these the build still succeeds but the app throws "Missing Supabase config" and renders a blank page. Vite inlines `VITE_*` values at build time, so changing one requires a redeploy, not just a restart. Shipping the anon key to the browser is intended - it is a public key and RLS is the real boundary.

3. **Point auth at the deployed domain**, or Google sign-in will fail:
   - Supabase > Authentication > URL Configuration: set Site URL to `https://<your-app>.vercel.app` and add `https://<your-app>.vercel.app/**` to Redirect URLs. To let preview deployments log in too, also add `https://<your-project>-*.vercel.app/**`.
   - Google Cloud Console > Credentials > your OAuth client: add `https://<your-app>.vercel.app` to Authorized JavaScript origins. The Authorized redirect URI stays the Supabase callback and does not change.

4. **Publish the Google consent screen** (OAuth consent screen > Publish App). While it is in Testing, only manually added test users can sign in, capped at 100, which works against the invite system. The app requests only the basic `email` and `profile` scopes, which Google does not require verification for.

Not GitHub Pages: it is a project site served from a subpath (needing a Vite `base`, a router change, and a base-aware OAuth redirect), and it cannot serve custom HTTP headers at all, so every security header below would silently stop applying.

Deploy notes:

- `vercel.json` (Vercel) and `public/_headers` + `public/_redirects` (Netlify) ship strict security headers - CSP locked to your Supabase project, HSTS, `frame-ancestors 'none'` - plus the SPA fallback rewrite. CORS is not the boundary for a public anon key; RLS is, and the CSP keeps the app itself from talking to anything but Supabase.
- In production, turn **"Confirm email" back on** (Authentication > Providers > Email) and set your **Site URL and redirect URLs** (Authentication > URL Configuration) to your deployed domain.
- Consider enabling **leaked password protection** and **CAPTCHA** under Authentication > Attack Protection for extra signup hardening.
- Compression (gzip/brotli) for both static assets and PostgREST JSON responses is handled by the Vercel/Netlify and Supabase edges automatically; the app's job is to not over-fetch, which the pagination and aggregate RPCs take care of.

## Notes

- Newsletters are delivered in-app, not by email. Each send creates a private message thread per member, so replies come back to the admin as normal conversations. Wiring up an email provider (for example Resend) is a possible later addition.
- The rank ladder lives in `src/lib/ranks.ts` on purpose: renaming ranks is a copy change, not a migration.
