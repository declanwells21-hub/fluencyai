-- Billing self-test. Run in the Supabase SQL editor AFTER supabase_migration_billing.sql.
-- Uses one existing account, then ends with an error on purpose so EVERYTHING it did is rolled back.
--   * Success looks like:  ERROR: ALL 9 CHECKS PASSED. Everything was rolled back.
--   * Failure looks like:  ERROR: CHECK FAILED: <what went wrong>

do $$
declare
  u uuid; b0 record; r record; n integer := 0;
begin
  select id into u from auth.users order by created_at limit 1;
  if u is null then raise exception 'CHECK FAILED: there is no account to test with'; end if;

  -- 1. the new profile columns exist
  n := n + 1;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
        and column_name in ('creem_customer_id', 'creem_subscription_id', 'plan_product_id')) <> 3 then
    raise exception 'CHECK FAILED: profiles is missing a Creem column';
  end if;

  select * into b0 from public.fl_credit_get(u);
  perform public.fl_credit_set_monthly(u, 300, now() + interval '10 days', 'self test', 'billing-selftest-m');
  perform public.fl_credit_grant(u, 500, 'topup', 'self test', null, 'billing-selftest-g');

  -- 2. revoke takes top-up credits and leaves monthly credits alone
  select * into r from public.fl_credit_revoke(u, 200, 'self test', 'self-test', 'billing-selftest-r1');
  n := n + 1; if r.duplicate or r.revoked <> 200 or r.topup <> b0.topup + 300 or r.monthly <> 300 then raise exception 'CHECK FAILED: revoke did not take exactly 200 top-up credits'; end if;

  -- 3. the same key does not revoke twice
  select * into r from public.fl_credit_revoke(u, 200, 'self test', 'self-test', 'billing-selftest-r1');
  n := n + 1; if not r.duplicate or r.revoked <> 0 or r.topup <> b0.topup + 300 then raise exception 'CHECK FAILED: a repeated key revoked twice'; end if;

  -- 4. revoke never goes below zero and says how much it really took
  select * into r from public.fl_credit_revoke(u, 1000000, 'self test', 'self-test', 'billing-selftest-r2');
  n := n + 1; if r.revoked <> b0.topup + 300 or r.topup <> 0 or r.monthly <> 300 then raise exception 'CHECK FAILED: revoke went below zero or touched monthly credits'; end if;

  -- 5. revoke refuses nonsense
  n := n + 1;
  begin
    perform * from public.fl_credit_revoke(u, 0);
    raise exception 'CHECK FAILED: a revoke of 0 was accepted';
  exception when raise_exception then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;

  -- 6. the ledger records the revokes
  n := n + 1;
  if (select count(*) from public.fl_credit_ledger where user_id = u and kind = 'revoke' and idempotency_key like 'billing-selftest-r%') <> 2 then
    raise exception 'CHECK FAILED: expected 2 revoke rows in the ledger';
  end if;

  -- 7. a Creem event id cannot be stored twice
  insert into public.billing_events (event_id, event_type, raw) values ('evt_selftest', 'subscription.paid', '{}'::jsonb);
  n := n + 1;
  begin
    insert into public.billing_events (event_id, event_type, raw) values ('evt_selftest', 'subscription.paid', '{}'::jsonb);
    raise exception 'CHECK FAILED: a duplicate event id was accepted';
  exception when unique_violation then null;
  end;

  -- 8. only the known outcomes are accepted
  n := n + 1;
  begin
    insert into public.billing_events (event_id, event_type, outcome) values ('evt_selftest2', 'x', 'banana');
    raise exception 'CHECK FAILED: an unknown outcome was accepted';
  exception when check_violation then null;
  end;

  -- 9. the browser cannot reach billing_events (RLS on, no policies); cleanup runs
  n := n + 1;
  if not (select relrowsecurity from pg_class where oid = 'public.billing_events'::regclass) then raise exception 'CHECK FAILED: row level security is off on billing_events'; end if;
  perform public.fl_billing_cleanup(365);

  raise exception 'ALL % CHECKS PASSED. Everything was rolled back.', n;
end;
$$;
