# Compliance: what the Privacy Policy and Terms promise, and what implements it

The Privacy Policy and Terms are final and are not edited here. This page lists each promise and where it is kept.
"Built" means code exists and is tested; "Manual" means a person does it; "Not built" is stated plainly.

| Promise (policy section) | Status | How |
|---|---|---|
| You must be 16 or older (Terms 2, Privacy 12) | **Built, self-declared** | A required box on sign-up ("I am 16 or older, and I agree to the Terms and Privacy Policy"), the same box for Google sign-up, and a one-time "One more step" screen for anyone who has not agreed. It is a declaration, not proof of age. There is no parental-consent flow. If you learn an account belongs to someone under 16, delete it (admin, Users, Delete). |
| Agreeing to the Terms and Privacy Policy | **Built** | `user_consents` records which version (the "Last updated" date) each person agreed to, with the source. When you publish a new version, change `legal` in `site/fluency-config.js`: everyone is asked again the next time they sign in. |
| Download your data (Privacy 9) | **Built** | "Download my data" in the account popup (and `POST /api/account {action:"export"}` for the app). Admin: Users, Export data, for a request that arrives by email. Limited to once every 5 minutes per person. |
| Delete your account (Privacy 9, Terms 13) | **Built** | "Delete my account" in the popup (`POST /api/account {action:"delete", confirm:"DELETE"}`) and admin Users, Delete, both use the same path (below). |
| Unsubscribe from waitlist emails (Privacy 8) | **Built** | Every waitlist email has a personal Unsubscribe link and a `List-Unsubscribe` header. The launch email skips anyone who unsubscribed. Joining again lifts it. |
| Speech providers may not train on your data; recordings deleted within 24 hours (Privacy 4 and 5) | **Built for Deepgram, see "Decision" below** | Deepgram requests now send `mip_opt_out=true`. |
| Waitlist emails kept until launch plus 12 months (Privacy 8) | **Built, needs the launch date** | `fl_retention_cleanup('<launch date>')`, scheduled below. |
| Conversation history kept until you delete it or 24 months after last activity; learning memory until you clear it (Privacy 8) | **Not on the server** | Conversations, transcripts, the word bank and the coach's memory are stored on the person's device. The app must offer the export and clearing (Settings, Privacy and memory) and the 24-month expiry. |
| Order and payment records kept as long as law requires (Privacy 8) | **Built** | Exam guide orders and payment events are kept and are not deleted with an account; they stop being linked to a login. |
| Support emails kept 24 months (Privacy 8) | **Manual** | Delete support mailbox messages older than 24 months. |
| Partners give payout and tax details | **Check** | Nothing in the database stores tax details. If you collect them by email or a spreadsheet, include them when you answer a data or deletion request, and delete them when the law no longer requires them. |
| We reply to requests within 30 days (Privacy 9) | **Manual** | The runbook is below. |
| Ask before using analytics cookies (Privacy 7) | **Nothing to build yet** | Analytics is not switched on (`analytics.provider` is empty). Build the consent banner before enabling any analytics. |

## What "delete my account" does

In this order, stopping at the first failure so nothing is half done:

1. **Unpaid partner earnings:** a partner with commissions not yet paid out is told to settle with support first (409). Admin can override with a confirmation.
2. **Subscription:** an active subscription is cancelled at Creem immediately. If Creem cannot be reached, nothing is deleted and the person is told to try again. They lose the rest of the paid period; the screen says so.
3. **Data:** `fl_delete_user_data` removes the waitlist, partner-interest and partner-application records under their email; takes their id off referral events; and de-identifies a partner record (name, email, niche and notes removed, status closed) but **keeps its code, commissions and payouts** for accounting.
4. **Login:** the login is deleted, which removes the profile, plan items, credits, credit history and consent records.
5. **Audit:** one row records that a deletion happened (when, and whether by the person or an admin), without recording who.

Kept after deletion, because the law requires it: exam guide order records and payment events (no longer linked to a login), and the de-identified partner record.

## Decision: Deepgram and the cost of the promise

Deepgram keeps every request and uses it to improve its models unless the request says `mip_opt_out=true`. The Privacy Policy promises
that providers may not train on your data and that audio is deleted within 24 hours, so the code now opts out **by default**
(`api/_lib/privacy.js`). Deepgram's pay-as-you-go and Growth plans give a 50% discount for taking part in model improvement, so
opting out roughly **doubles speech-to-text and text-to-speech prices** unless your contract says otherwise. Check this with
Deepgram or in your billing before launch. To accept the lower price instead, set `DEEPGRAM_MIP_OPT_OUT=false`, **and the Privacy Policy
must then change**, because it would no longer be true.

Still to verify by hand: the agreements with the other providers the policy refers to (the AI model, any other voice service) actually
say they do not train on your data and delete audio on the stated schedule. The code cannot check that.

## Switching it on

1. Supabase SQL editor: run `scripts/supabase_migration_compliance.sql`, then `scripts/compliance_self_test.sql`.
   Success is `ERROR: ALL 13 CHECKS PASSED. Everything was rolled back.` The test creates a throwaway account and removes it again.
2. Deploy. Everything above works without any new variable. Optional: `UNSUBSCRIBE_SECRET` (a long random string; keep it, because
   changing it breaks unsubscribe links already sent), `SITE_URL` (default https://fluencyai.app), `DEEPGRAM_MIP_OPT_OUT`.
   `CREEM_API_KEY` must be set for deletion of subscribers to work.
3. Schedule the retention clean-up (Supabase has `pg_cron`: Database, Extensions, enable `pg_cron`), then in the SQL editor, with the real launch date:

       select cron.schedule('fluency-retention', '17 3 * * *', $$select public.fl_retention_cleanup('2026-12-01')$$);

   It removes AI usage rows older than 180 days, handled billing events older than 365 days, and (only after launch plus 12 months) the waitlist.
4. Try it on a test account: sign up (the box is required), download your data, delete the account.

## Support runbook: someone writes asking about their data

- **"What data do you hold?"** Admin, Users, find them, **Export data**, send the file.
- **"Delete my account"** Admin, Users, **Delete**. (If it says they are a partner with unpaid earnings, settle first, or confirm the override.)
  Then check your support mailbox and any spreadsheet for their details.
- **"Unsubscribe me"** They can use the link in any email. Otherwise the waitlist row can be given an unsubscribe date, or removed.
- **"Correct my data"** There is no self-service for the email address; do it in Supabase, Authentication, Users.
- Reply within 30 days, as the policy says.

## Not built, on purpose or for later

- The app's Settings, Privacy and memory screen (export, clear and 24-month expiry of on-device data): Flutter step.
- Consent enforced on the AI endpoints. Today the site asks and records consent; the endpoints do not refuse people who have not agreed.
  When the app launches, `aiGuard` can check `user_consents` as it checks sign-in.
- A cookie/analytics consent banner (no analytics is enabled).
- Proof of age and parental consent.
