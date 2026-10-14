# Partner Program and Partner Hub: rollout notes

## What partners experience

1. They apply on the Partners page (as before).
2. **You approve or reject in the admin dashboard** (as before). Now they are told automatically:
   - Approved: an email with their code, how to sign in to the Partner Hub, how they earn, and a request to reply with their payout method.
   - Rejected: a polite decline.
   - If an email fails to send, the dashboard says so, and each partner row has a **Resend email** button.
3. They open **fluencyai.app/partner-hub** and sign in with a Fluency AI account that has the **same email address they applied with**
   (the account's email must be confirmed). The first visit links the account to their partner record.
4. The hub shows, depending on who is signed in: sign-in prompt, "not applied yet", "application received", "not accepted", "on hold",
   or, for an accepted partner, **Overview** (code, link, ready to pay, in hold, accounts created, funnel, 30-day chart),
   **Sales** (each sale and whether it is in the refund hold, ready to pay, paid or refunded), **Links** (a link builder for the home page,
   store, pricing or any single guide, with copy) and **Payouts**.
5. The hub is not in the sitemap and is marked noindex.

## Commission rules (confirmed with the client)

- 20% (each partner's own rate is on their record) of a referred person's **first** app subscription payment, never of renewals,
  and 20% of every exam blueprint sold through their link.
- Held 14 days for refunds, then ready to pay. Payouts monthly, only once ready-to-pay reaches $20.
- A partner never earns on their own account. Referred buyers get a discount at checkout (set up in the billing and Selar steps).

## Deploy order

1. Supabase SQL editor, in this order, each safe to run again: `supabase_migration_backend_foundation.sql` (a small correction was made to it: the
   `referral_events` table now includes the columns the billing webhook writes), `supabase_migration_credits.sql`, `supabase_migration_partner_hub.sql`.
   A brand-new project can be set up from these three files alone.
2. Upload the code.
3. In Vercel, make sure the email settings exist (`BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, optional `EMAIL_FROM_NAME`); the approval email uses them.

No new serverless function was added (the project is at the 12-function limit). The hub reads its data through database functions
(`fl_my_partner`) using the signed-in person's own session.

## How the numbers get in

| Number | Where it comes from |
|---|---|
| Link opens | A visit with `?ref=CODE` (or `/r/CODE`) reports one click per browser tab session. Opens are for insight only and are never paid. |
| Accounts created | When someone signs up on the site after arriving through a link, the code is saved on the new account (database function `fl_claim_referral`). Only brand-new accounts (under 3 days old) can be credited, and never the partner's own. |
| App subscription sales | The billing webhook (`creem-webhook.js`) records the commission on a referred person's checkout. One per person, ever, so renewals earn nothing. |
| Exam blueprint sales | **Not wired yet.** They need the Selar order receiver (a later step). Until then blueprint sales do not appear in the hub. Use `fl_record_partner_commission` (kind `exam_blueprint`) from that webhook, and `fl_partner_reverse_commission` for refunds. |

Important: the billing webhook records the commission when the checkout event arrives. When the billing rework (Plus plan, top-ups) is done,
the subscription "first payment" event should call the same function, so the rule "first payment only" keeps holding.

## Paying partners

Admin dashboard, **Partner payouts** panel: shows each partner's ready-to-pay, in-hold and paid-so-far amounts, whether their account is linked,
and whether the welcome email went out. Pay the partner yourself (bank transfer or similar), **then** press **Mark paid** and enter the payment
reference. That records the payout and moves those commissions to paid; the partner sees it in their Payouts tab. The button is disabled below $20.
Payout details are not collected on the site: the welcome email asks partners to reply with their preferred method.

## Refunds

Before payout, call `select fl_partner_reverse_commission('app_subscription', '<billing event id>')` (or `'exam_blueprint'` with the Selar order id):
the commission becomes "refunded" and drops out of the totals. After payout it answers `already_paid` and leaves it for a person to settle.

## Tests

- `node tests/partner_hub.test.js` (22 checks): emails, approval endpoint, admin tools, click beacon, billing hook.
- The SQL was run on a real PostgreSQL: linking by confirmed email, new-account-only attribution, own-code and self-purchase blocks, first-subscription-only,
  14-day hold, $20 minimum, payout, refunds, and who may call which function.
