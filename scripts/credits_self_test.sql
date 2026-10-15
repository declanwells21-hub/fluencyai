-- Credits self-test. Run in the Supabase SQL editor AFTER supabase_migration_credits.sql.
--
-- It uses one existing account (the first one it finds), exercises every credits function, and then
-- deliberately ends with an error so that EVERYTHING it did is rolled back. Nothing is changed permanently.
--
--   * Success looks like:  ERROR: ALL 15 CHECKS PASSED. Everything was rolled back.
--   * Failure looks like:  ERROR: CHECK FAILED: <what went wrong>
--
-- Needs at least one account in Authentication > Users.

do $$
declare
  u uuid;
  b0 record; b record; c record; r jsonb;
  n integer := 0;
begin
  select id into u from auth.users order by created_at limit 1;
  if u is null then raise exception 'CHECK FAILED: there is no account to test with'; end if;

  select * into b0 from public.fl_credit_get(u);

  -- 1. an admin grant adds top-up credits
  select * into b from public.fl_credit_grant(u, 500, 'admin_grant', 'self test', 'self-test', 'self-test-key-1');
  n := n + 1; if b.duplicate or b.topup <> b0.topup + 500 then raise exception 'CHECK FAILED: grant did not add 500 top-up credits'; end if;

  -- 2. the same idempotency key does not grant twice
  select * into b from public.fl_credit_grant(u, 500, 'admin_grant', 'self test', 'self-test', 'self-test-key-1');
  n := n + 1; if not b.duplicate or b.topup <> b0.topup + 500 then raise exception 'CHECK FAILED: a repeated key granted twice'; end if;

  -- 3. a monthly allowance replaces, it does not add
  select * into b from public.fl_credit_set_monthly(u, 300, now() + interval '30 days', 'self test', 'self-test-key-2');
  n := n + 1; if b.monthly <> 300 then raise exception 'CHECK FAILED: monthly allowance is not 300'; end if;
  select * into b from public.fl_credit_set_monthly(u, 300, now() + interval '30 days', 'self test', 'self-test-key-3');
  n := n + 1; if b.monthly <> 300 then raise exception 'CHECK FAILED: monthly allowance added up instead of replacing'; end if;

  -- 4. spending takes monthly credits first
  select * into c from public.fl_credit_charge(u, 10, 'chat', 'converse', 100, 50, null, null, false);
  n := n + 1; if c.charged <> 10 or c.monthly <> 290 or c.topup <> b0.topup + 500 then raise exception 'CHECK FAILED: spending did not use monthly credits first'; end if;

  -- 5. shadow mode records usage but takes nothing
  select * into c from public.fl_credit_charge(u, 10, 'tts', null, null, null, null, 400, true);
  n := n + 1; if c.charged <> 0 or c.monthly <> 290 then raise exception 'CHECK FAILED: shadow mode took credits'; end if;

  -- 6. when monthly credits run out, top-up credits are used
  select * into c from public.fl_credit_charge(u, 300, 'chat', 'plan', null, null, null, null, false);
  n := n + 1; if c.monthly <> 0 or c.topup <> b0.topup + 500 - 10 or c.shortfall <> 0 then raise exception 'CHECK FAILED: spending did not fall through to top-up credits'; end if;

  -- 7. a balance never goes below zero; the uncovered part is recorded
  select * into c from public.fl_credit_charge(u, b0.topup + 500 - 10 + 7, 'chat', 'converse', null, null, null, null, false);
  n := n + 1; if c.total <> 0 or c.shortfall <> 7 then raise exception 'CHECK FAILED: balance went negative or the shortfall is wrong'; end if;

  -- 8. expired monthly credits count as zero straight away
  select * into b from public.fl_credit_set_monthly(u, 100, now() - interval '1 minute', 'expired on purpose', 'self-test-key-4');
  n := n + 1; if b.monthly <> 0 then raise exception 'CHECK FAILED: expired monthly credits still count'; end if;

  -- 9. bad input is refused
  begin
    perform * from public.fl_credit_grant(u, 0, 'admin_grant');
    raise exception 'CHECK FAILED: a grant of 0 was accepted';
  exception when raise_exception then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  n := n + 1;

  -- 10. the admin usage report works and sees what we just recorded
  r := public.fl_admin_credit_usage(1);
  n := n + 1; if jsonb_array_length(r -> 'by_route') < 2 then raise exception 'CHECK FAILED: usage report has no rows'; end if;

  -- 11. an unknown person has a zero balance (no error)
  select * into b from public.fl_credit_get('00000000-0000-0000-0000-000000000000');
  n := n + 1; if b.total <> 0 then raise exception 'CHECK FAILED: unknown account does not read as zero'; end if;

  -- 12. the ledger explains the balance
  n := n + 1;
  if (select count(*) from public.fl_credit_ledger where user_id = u and idempotency_key like 'self-test-key-%') <> 4 then
    raise exception 'CHECK FAILED: expected 4 ledger rows from this test';
  end if;

  -- 13. usage rows were written
  n := n + 1;
  if (select count(*) from public.fl_ai_usage where user_id = u and created_at > now() - interval '5 minutes') < 4 then
    raise exception 'CHECK FAILED: usage rows are missing';
  end if;

  -- 14. cleanup function runs
  n := n + 1; perform public.fl_ai_usage_cleanup(180);

  raise exception 'ALL % CHECKS PASSED. Everything was rolled back.', n;
end;
$$;
