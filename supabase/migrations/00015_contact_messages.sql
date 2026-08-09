-- =============================================================
-- Fresno Skillshare - contact messages in the admin dashboard
-- Run after 00014_approve_member.sql.
--
-- The landing page contact form now stores messages here instead of
-- relying on an external form-to-email service. Admins read and
-- manage them under Admin > Contact.
--
-- Input safety, in layers: the client trims/strips control characters
-- and caps lengths; these CHECK constraints enforce the same limits
-- in the database; inserts are rate limited per IP; and the UI renders
-- everything as plain text (React escaping), never as HTML.
-- =============================================================

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'read')),
  created_at timestamptz not null default now(),
  constraint contact_messages_name_len check (btrim(name) <> '' and char_length(name) <= 120),
  constraint contact_messages_email_shape check (
    char_length(email) <= 320 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint contact_messages_message_len check (btrim(message) <> '' and char_length(message) <= 2000)
);
create index contact_messages_status_created_idx
  on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;

-- Anyone (signed out included) can send a message; only admins read them.
create policy "Anyone can send a contact message"
  on public.contact_messages for insert
  to anon, authenticated
  with check (status = 'new');

create policy "Admins read contact messages"
  on public.contact_messages for select
  using (public.is_admin());

create policy "Admins update contact messages"
  on public.contact_messages for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete contact messages"
  on public.contact_messages for delete
  using (public.is_admin());

-- Same per-IP rate limiting the join form had.
create trigger rl_contact_messages before insert on public.contact_messages
  for each row execute function public.rate_limit_trigger('contact_messages', '5', '3600');
