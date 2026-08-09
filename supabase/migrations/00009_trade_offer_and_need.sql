-- =============================================================
-- Fresno Skillshare - trades say what you offer and what you need
-- Run after 00008_public_events_and_realtime.sql.
--
-- A barter is two halves, so a trade now carries them directly:
-- "what I'm offering" and "what I need". That replaces the old free
-- text notes field and the task checklist, which described the work
-- but never the exchange.
--
-- Dropping the checklist also removes the gate that every task had to
-- be ticked before a trade could be completed. Confirmation by the
-- other member is now the only requirement.
-- =============================================================

alter table public.trades
  add column offering text,
  add column needing text;

-- Carry any existing text across before the columns become required.
update public.trades
set offering = coalesce(nullif(btrim(notes), ''), 'Not specified'),
    needing = 'Not specified'
where offering is null;

alter table public.trades
  alter column offering set not null,
  alter column needing set not null,
  add constraint trades_offering_len
    check (btrim(offering) <> '' and char_length(offering) <= 2000),
  add constraint trades_needing_len
    check (btrim(needing) <> '' and char_length(needing) <= 2000);

alter table public.trades drop column notes;

-- The checklist and everything hanging off it (policies, rate-limit
-- trigger, indexes) goes with the table.
drop table if exists public.trade_tasks cascade;

drop function if exists public.create_trade_with_tasks(uuid, text, text, text[]);

-- ---------- creating a trade ----------

-- A null partner still means "post it to the open board".
create or replace function public.create_trade(
  p_partner_id uuid,
  p_title text,
  p_offering text,
  p_needing text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_trade_id uuid;
  v_offering text := left(btrim(coalesce(p_offering, '')), 2000);
  v_needing text := left(btrim(coalesce(p_needing, '')), 2000);
begin
  if p_partner_id is not null then
    if p_partner_id = auth.uid() then
      raise exception 'You cannot propose a trade with yourself';
    end if;
    if not exists (select 1 from public.profiles where id = p_partner_id and status = 'active') then
      raise exception 'Trade partner not found';
    end if;
  end if;
  if btrim(coalesce(p_title, '')) = '' or char_length(p_title) > 140 then
    raise exception 'Trade title is required (140 characters max)';
  end if;
  if v_offering = '' then
    raise exception 'Say what you are offering';
  end if;
  if v_needing = '' then
    raise exception 'Say what you need';
  end if;

  insert into public.trades (proposer_id, partner_id, title, offering, needing, status, was_open)
  values (
    auth.uid(),
    p_partner_id,
    btrim(p_title),
    v_offering,
    v_needing,
    case when p_partner_id is null then 'open' else 'proposed' end,
    p_partner_id is null
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

-- ---------- completion ----------

-- Same direction rule as before (whoever asked confirms, whoever did the
-- work earns the badge); only the task gate is gone.
create or replace function public.confirm_trade_completion(p_trade_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.trades;
  v_confirmer uuid;
  v_recipient uuid;
begin
  select * into t from public.trades where id = p_trade_id for update;
  if t.id is null then
    raise exception 'Trade not found';
  end if;

  if t.was_open then
    v_confirmer := t.proposer_id;
    v_recipient := t.partner_id;
  else
    v_confirmer := t.partner_id;
    v_recipient := t.proposer_id;
  end if;

  if auth.uid() <> v_confirmer then
    if t.was_open then
      raise exception 'Only the member who posted this trade can confirm it is done';
    else
      raise exception 'Only the trade partner can confirm completion';
    end if;
  end if;
  if t.status <> 'accepted' then
    raise exception 'Trade must be accepted before it can be completed';
  end if;

  update public.trades
  set status = 'completed', completed_at = now()
  where id = p_trade_id;

  insert into public.badges (user_id, trade_id, label, awarded_by)
  values (v_recipient, t.id, t.title, v_confirmer);
end;
$$;
