-- Selar orders: run once in the Supabase SQL editor, AFTER supabase_migration_partner_hub.sql.
-- Safe to run more than once.
--
-- Every order Selar reports to /api/selar-order is stored here exactly as it arrived (raw), then interpreted.
-- Keeping the raw copy means a wrong guess about Selar's field names can be corrected without losing a sale.
--
--   status
--     received             stored, not processed yet (or processing was interrupted)
--     commission_recorded  a partner commission exists for it (it still sits in the 14-day refund hold)
--     unattributed         no partner code found in the order. Fix by hand in the admin ("Attribute").
--     needs_review         a partner code was found but the US-dollar amount could not be worked out safely
--     self_referral        the buyer is the partner. No commission.
--     ignored              not a paid order (pending or failed payment, or a zero amount). No commission.
--     refunded             the order was refunded: its commission was reversed (or was already paid, see note)
--     error                something failed while processing. Retry by hand in the admin.
--
-- Contains buyer emails: only the API (service role) can read it. RLS is on with no policies.

create table if not exists public.selar_orders (
  id              uuid primary key default gen_random_uuid(),
  order_ref       text not null unique,       -- Selar's order id; a hash of the body when Selar sends none
  received_at     timestamptz not null default now(),
  raw             jsonb not null,
  status          text not null default 'received'
                  check (status in ('received', 'commission_recorded', 'unattributed', 'needs_review', 'self_referral', 'ignored', 'refunded', 'error')),
  note            text,
  buyer_email     text,
  buyer_name      text,
  product_name    text,
  product_code    text,                        -- Selar product code when it is one of ours
  amount          numeric,                     -- what the buyer paid, in the buyer's currency
  currency        text,
  gross_cents_usd integer,                     -- the same amount in US cents (the basis for the commission)
  fx_rate         numeric,                     -- rate used when the order was not in US dollars
  partner_code    text,
  code_source     text check (code_source in ('ref', 'coupon', 'url', 'admin')),
  creator_id      uuid references public.creators (id) on delete set null,
  commission_cents integer,
  processed_at    timestamptz
);
alter table public.selar_orders enable row level security;
create index if not exists selar_orders_received_idx on public.selar_orders (received_at desc);
create index if not exists selar_orders_status_idx on public.selar_orders (status);

-- Records the commission for a Selar order. A wrapper around fl_record_partner_commission that also
--   * finds the buyer's account by email (so the "partner buying with their own code" check works), and
--   * stops a partner whose contact email is the buyer's email even when the buyer has no account.
-- creator_id is returned whenever the code belongs to a real, active partner, so the caller can tell
-- "unknown code, try the next one" from "known partner, but no commission (self referral, duplicate)".
create or replace function public.fl_selar_commission(
  p_code        text,
  p_buyer_email text,
  p_gross_cents integer,
  p_currency    text,
  p_order_ref   text,
  p_product     text default null
)
returns table (created boolean, reason text, commission_cents integer, creator_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.creators%rowtype;
  v_user uuid;
  r record;
begin
  select * into c from public.creators x where upper(x.code) = upper(trim(p_code)) and x.status = 'active';
  if not found then
    created := false; reason := 'unknown_or_inactive_code'; commission_cents := 0; creator_id := null;
    return next; return;
  end if;
  creator_id := c.id;

  if p_buyer_email is not null and lower(trim(p_buyer_email)) = lower(coalesce(c.contact_email, '')) then
    created := false; reason := 'self_referral'; commission_cents := 0;
    return next; return;
  end if;

  if p_buyer_email is not null then
    select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_buyer_email)) limit 1;
  end if;

  select * into r from public.fl_record_partner_commission(p_code, 'exam_blueprint', v_user, p_gross_cents, p_currency, p_order_ref, p_product);
  created := r.created; reason := r.reason; commission_cents := r.commission_cents;
  return next;
end;
$$;

revoke all on function public.fl_selar_commission(text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.fl_selar_commission(text, text, integer, text, text, text) to service_role;
