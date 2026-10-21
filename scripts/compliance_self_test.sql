-- Compliance self-test. Run in the Supabase SQL editor AFTER supabase_migration_compliance.sql.
--
-- It creates a THROWAWAY account and test data, exercises consent, export, deletion and retention, then ends with an error on
-- purpose so that EVERYTHING it did (including the throwaway account) is rolled back. Nothing is changed permanently.
--
--   * Success looks like:  ERROR: ALL 13 CHECKS PASSED. Everything was rolled back.
--   * Failure looks like:  ERROR: CHECK FAILED: <what went wrong>

do $$
declare
  u        uuid := gen_random_uuid();
  v_email  text := 'compliance-selftest-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
  v_creator uuid;
  r        jsonb;
  c        record;
  n        integer := 0;
begin
  -- the throwaway account (the normal signup trigger, if there is one, creates its profile)
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');
  exception when others then
    raise exception 'CHECK FAILED: could not create a throwaway account to test with (%)', sqlerrm;
  end;
  insert into public.profiles (id) values (u) on conflict (id) do nothing;

  -- act as that signed-in person
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);

  -- 1. nobody has agreed yet
  n := n + 1; if exists (select 1 from public.fl_my_consent()) then raise exception 'CHECK FAILED: a new account already has a consent record'; end if;

  -- 2. agreeing is recorded, and doing it twice is harmless
  perform public.fl_record_consent('2026-09-09', '2026-09-09', true, 'selftest');
  perform public.fl_record_consent('2026-09-09', '2026-09-09', true, 'selftest');
  n := n + 1;
  select * into c from public.fl_my_consent();
  if c.terms_version is distinct from '2026-09-09' or not c.age_16_confirmed or (select count(*) from public.user_consents where user_id = u) <> 1 then
    raise exception 'CHECK FAILED: consent was not recorded exactly once';
  end if;

  -- 3. a newer version is a new record (so people can be asked again when the Terms change)
  perform public.fl_record_consent('2026-12-01', '2026-12-01', true, 'selftest');
  n := n + 1; select * into c from public.fl_my_consent();
  if c.terms_version <> '2026-12-01' or (select count(*) from public.user_consents where user_id = u) <> 2 then raise exception 'CHECK FAILED: a new version did not create a new consent record'; end if;

  -- 4. nobody under 16 (or not saying so) can be recorded as agreeing
  n := n + 1;
  begin
    perform public.fl_record_consent('2026-09-09', '2026-09-09', false, 'selftest');
    raise exception 'CHECK FAILED: consent was accepted without the age confirmation';
  exception when raise_exception then if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;

  -- 5. nonsense versions and signed-out callers are refused
  n := n + 1;
  begin
    perform public.fl_record_consent('yesterday', '2026-09-09', true, 'selftest');
    raise exception 'CHECK FAILED: a malformed version was accepted';
  exception when raise_exception then if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.fl_record_consent('2026-09-09', '2026-09-09', true, 'selftest');
    raise exception 'CHECK FAILED: consent was accepted from someone not signed in';
  exception when raise_exception then if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);

  -- test data tied to the person (by login or by email)
  insert into public.waitlist_signups (email, source) values (v_email, 'selftest');
  insert into public.partner_interest (email, source) values (v_email, 'selftest');
  insert into public.creator_applications (name, email, platform, handle) values ('Self Test', v_email, 'youtube', '@selftest');
  insert into public.creators (name, code, contact_email, niche, notes, user_id) values ('Self Test Partner', 'SELFTEST' || substr(replace(u::text, '-', ''), 1, 8), v_email, 'languages', 'private note', u) returning id into v_creator;
  insert into public.referral_events (creator_id, code, event_type, user_id) values (v_creator, 'SELFTEST', 'click', u);
  perform public.fl_credit_grant(u, 500, 'admin_grant', 'self test', 'self-test', null);

  -- 6. the export holds the person's own data
  r := public.fl_export_user_data(u);
  n := n + 1;
  if r is null or r -> 'account' ->> 'email' <> lower(v_email) then raise exception 'CHECK FAILED: the export is missing the account'; end if;
  if jsonb_array_length(r -> 'consents') <> 2 then raise exception 'CHECK FAILED: the export is missing the consent records'; end if;
  if jsonb_array_length(r -> 'waitlist') <> 1 or jsonb_array_length(r -> 'partner_interest') <> 1 or jsonb_array_length(r -> 'partner_applications') <> 1 then raise exception 'CHECK FAILED: the export is missing form submissions'; end if;
  if r -> 'partner' -> 'record' ->> 'name' <> 'Self Test Partner' then raise exception 'CHECK FAILED: the export is missing the partner record'; end if;
  if (r -> 'credits' -> 'balance' ->> 'topup_credits')::int <> 500 or jsonb_array_length(r -> 'credits' -> 'history') <> 1 then raise exception 'CHECK FAILED: the export is missing the credits'; end if;

  -- 7. it does not leak other people's data or raw payloads
  n := n + 1;
  if (r::text) like '%"raw"%' then raise exception 'CHECK FAILED: the export contains a raw payment payload'; end if;
  if public.fl_export_user_data('00000000-0000-0000-0000-000000000000') is not null then raise exception 'CHECK FAILED: exporting an unknown account did not return nothing'; end if;

  -- 8. the browser-facing roles cannot call the export or the deletion
  n := n + 1;
  if has_function_privilege('anon', 'public.fl_export_user_data(uuid)', 'execute') or has_function_privilege('authenticated', 'public.fl_export_user_data(uuid)', 'execute')
     or has_function_privilege('anon', 'public.fl_delete_user_data(uuid)', 'execute') or has_function_privilege('authenticated', 'public.fl_delete_user_data(uuid)', 'execute') then
    raise exception 'CHECK FAILED: signed-in or anonymous callers could run the export or deletion for anyone';
  end if;

  -- 9. deletion removes the email-based records and de-identifies the partner, keeping the partner code for accounting
  r := public.fl_delete_user_data(u);
  n := n + 1;
  if exists (select 1 from public.waitlist_signups where lower(email) = lower(v_email)) or exists (select 1 from public.partner_interest where lower(email) = lower(v_email))
     or exists (select 1 from public.creator_applications where lower(email) = lower(v_email)) then raise exception 'CHECK FAILED: email-based records survived the deletion'; end if;
  select * into c from public.creators where id = v_creator;
  if c.name <> 'Deleted partner' or c.contact_email is not null or c.niche is not null or c.notes is not null or c.status <> 'closed' or c.user_id is not null or c.code is null then
    raise exception 'CHECK FAILED: the partner record was not de-identified correctly';
  end if;
  n := n + 1;
  if exists (select 1 from public.referral_events where user_id = u) then raise exception 'CHECK FAILED: referral events still point at the person'; end if;
  if (r ->> 'waitlist_removed')::int <> 1 or (r ->> 'partner_records_deidentified')::int <> 1 then raise exception 'CHECK FAILED: the deletion report is wrong (%)', r; end if;

  -- 10. deleting the login removes what is tied to it
  delete from auth.users where id = u;
  n := n + 1;
  if exists (select 1 from public.user_consents where user_id = u) or exists (select 1 from public.fl_credit_balances where user_id = u) or exists (select 1 from public.fl_credit_ledger where user_id = u) then
    raise exception 'CHECK FAILED: consent or credit records survived the login being deleted';
  end if;

  -- 11. retention runs, and a waitlist is only cleared once launch + 12 months has passed
  insert into public.waitlist_signups (email, source) values ('keep-' || v_email, 'selftest');
  n := n + 1;
  perform public.fl_retention_cleanup(current_date);
  if not exists (select 1 from public.waitlist_signups where email = 'keep-' || v_email) then raise exception 'CHECK FAILED: the waitlist was cleared before launch + 12 months'; end if;
  perform public.fl_retention_cleanup(current_date - 800);
  n := n + 1;
  if exists (select 1 from public.waitlist_signups where email = 'keep-' || v_email) then raise exception 'CHECK FAILED: the waitlist was not cleared after launch + 12 months'; end if;

  raise exception 'ALL % CHECKS PASSED. Everything was rolled back.', n;
end;
$$;
