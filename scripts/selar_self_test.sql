-- Selar self-test. Run in the Supabase SQL editor AFTER supabase_migration_selar.sql.
--
-- It creates a throwaway partner and orders, exercises fl_selar_commission and the order table, then ends with an
-- error on purpose so that EVERYTHING it did is rolled back. Nothing is changed permanently.
--
--   * Success looks like:  ERROR: ALL 9 CHECKS PASSED. Everything was rolled back.
--   * Failure looks like:  ERROR: CHECK FAILED: <what went wrong>

do $$
declare
  r record;
  n integer := 0;
  v_creator uuid;
  v_text text;
begin
  insert into public.creators (name, code, contact_email) values ('Self test partner', 'SELFTEST1', 'selftest-partner@example.invalid') returning id into v_creator;

  -- 1. an unknown code is reported as such, with no partner id (so the caller can try the next candidate)
  select * into r from public.fl_selar_commission('NOSUCHCODE', 'buyer@example.invalid', 900, 'usd', 'selftest-order-0', 'Goethe B1');
  n := n + 1; if r.created or r.reason <> 'unknown_or_inactive_code' or r.creator_id is not null then raise exception 'CHECK FAILED: unknown code was not reported as unknown'; end if;

  -- 2. a real code creates a commission of 20% of the dollar amount (the default rate)
  select * into r from public.fl_selar_commission('SELFTEST1', 'buyer@example.invalid', 900, 'usd', 'selftest-order-1', 'Goethe B1');
  n := n + 1; if not r.created or r.commission_cents <> 180 or r.creator_id <> v_creator then raise exception 'CHECK FAILED: expected a 180 cent commission on 900 cents'; end if;

  -- 3. the same order again does not pay twice
  select * into r from public.fl_selar_commission('SELFTEST1', 'buyer@example.invalid', 900, 'usd', 'selftest-order-1', 'Goethe B1');
  n := n + 1; if r.created or r.reason <> 'already_recorded' then raise exception 'CHECK FAILED: the same order was paid twice'; end if;

  -- 4. codes are not case sensitive
  select * into r from public.fl_selar_commission('selftest1', 'buyer@example.invalid', 1200, 'usd', 'selftest-order-2', 'TCF Canada');
  n := n + 1; if not r.created or r.commission_cents <> 240 then raise exception 'CHECK FAILED: a lower-case code was not accepted'; end if;

  -- 5. a partner buying with their own code earns nothing (matched by email even without an account)
  select * into r from public.fl_selar_commission('SELFTEST1', 'Selftest-Partner@Example.invalid', 900, 'usd', 'selftest-order-3', 'Goethe B1');
  n := n + 1; if r.created or r.reason <> 'self_referral' then raise exception 'CHECK FAILED: self purchase earned a commission'; end if;

  -- 6. an order is stored raw, and the same Selar order id cannot be stored twice
  insert into public.selar_orders (order_ref, raw, buyer_email, amount, currency) values ('selftest-order-1', '{"hello":"selar"}'::jsonb, 'buyer@example.invalid', 9, 'USD');
  n := n + 1;
  begin
    insert into public.selar_orders (order_ref, raw) values ('selftest-order-1', '{}'::jsonb);
    raise exception 'CHECK FAILED: a duplicate order id was accepted';
  exception when unique_violation then null;
  end;

  -- 7. only the known statuses are accepted
  n := n + 1;
  begin
    insert into public.selar_orders (order_ref, raw, status) values ('selftest-order-9', '{}'::jsonb, 'banana');
    raise exception 'CHECK FAILED: an unknown status was accepted';
  exception when check_violation then null;
  end;

  -- 8. a refund reverses the commission; an order with no commission says so
  n := n + 1; v_text := public.fl_partner_reverse_commission('exam_blueprint', 'selftest-order-1');
  if v_text <> 'reversed' then raise exception 'CHECK FAILED: refund did not reverse the commission (got %)', v_text; end if;
  v_text := public.fl_partner_reverse_commission('exam_blueprint', 'selftest-order-none');
  if v_text <> 'not_found' then raise exception 'CHECK FAILED: refund of an unknown order said %', v_text; end if;

  -- 9. the browser cannot reach the order table (RLS is on and there are no policies)
  n := n + 1;
  if not (select relrowsecurity from pg_class where oid = 'public.selar_orders'::regclass) then raise exception 'CHECK FAILED: row level security is off on selar_orders'; end if;

  raise exception 'ALL % CHECKS PASSED. Everything was rolled back.', n;
end;
$$;
