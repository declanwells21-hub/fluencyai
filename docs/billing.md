# Billing: Fluency Plus, top-ups, refunds and partner commission (Creem)

Creem is the seller of record. This site never sees a card. Creem tells `api/creem-webhook.js` what happened,
and `api/_lib/billing.js` turns each event into credits, a subscription status and (for referred people) a partner
commission. Every event is stored in the `billing_events` table with what happened, and anything the system cannot
decide safely is shown in the admin dashboard under **Billing events that need you**.

## The rules

| What | Rule |
|---|---|
| **Fluency Plus** | $12 a month. Each paid month **replaces** the monthly credits with 3,000 (unused credits do not stack). They expire at the end of the paid period. |
| **Top-ups** | One-time packs: $5 = 500, $10 = 1,100, $20 = 2,400 credits. They never expire and are spent after the monthly credits. |
| **When credits are given** | Plus: on the `subscription.paid` event (Creem's recommended trigger), once per billing period. Top-ups: on `checkout.completed`, once per order. |
| **Who can buy a top-up** | Only a signed-in person with an active Plus. Set `ALLOW_TOPUP_WITHOUT_PLUS=true` to allow anyone. |
| **Cancel** | Status becomes `canceled`. The monthly credits already paid for keep working until the period ends, then expire by themselves. |
| **Expired / unpaid** | Status goes back to `free` (or `unpaid`) and the monthly credits end. Top-up credits are kept. |
| **Full refund of a subscription payment** | Subscription ended, monthly credits removed, partner commission reversed (or flagged if it was already paid out). |
| **Partial refund, chargeback, refund of a top-up** | Not guessed: shown for you to decide (see below). A chargeback also reverses the commission and ends the monthly credits. |
| **Partner commission** | 20% of the product price (US dollars, before tax) on a referred person's **first** subscription payment only. Never renewals, never top-ups. A free trial does not use up the "first payment"; the commission is created when the first real payment arrives. Held 14 days. |

Credits are decided from **Creem's product id**, never from anything the browser or app sends.

## One-time setup

1. **Creem dashboard, Products.** Create four products (USD):
   - Fluency Plus: recurring, monthly, $12.
   - Top-up 500: one-time, $5. Top-up 1,100: one-time, $10. Top-up 2,400: one-time, $20.
   (The Pricing page does not mention a free trial. If you want one, set it on the Plus product in Creem; the commission then
   waits for the first real payment automatically.)
2. **Vercel environment variables** (use the `creem_test_` key and test products first, then swap in the live ones):

   | Variable | Value |
   |---|---|
   | `CREEM_API_KEY` | your Creem API key (`creem_test_...` or `creem_...`) |
   | `CREEM_WEBHOOK_SECRET` | the signing secret Creem shows when you add the webhook |
   | `CREEM_PRODUCT_PLUS` | `prod_...` of Fluency Plus |
   | `CREEM_PRODUCT_TOPUP_5`, `CREEM_PRODUCT_TOPUP_10`, `CREEM_PRODUCT_TOPUP_20` | `prod_...` of each top-up |
   | `APP_SUCCESS_URL` | where people land after paying (a page on fluencyai.app) |
   | `PLUS_MONTHLY_CREDITS` | optional, default 3000 |
   | `ALLOW_TOPUP_WITHOUT_PLUS` | optional, `true` to let anyone buy a top-up |
   | `CREEM_PRODUCT_FOUNDING`, `_WEEKLY`, `_YEARLY` | only if you still sell the old products |
3. **Supabase SQL editor:** run `scripts/supabase_migration_billing.sql` (after the credits and partner hub files), then
   `scripts/billing_self_test.sql`. Success is `ERROR: ALL 9 CHECKS PASSED. Everything was rolled back.`
4. **Creem dashboard, Developers, Webhooks:** add `https://fluencyai.app/api/creem-webhook`. Creem sends every event type to it.
5. **Test in test mode before going live** (below).

## Test in test mode

1. Make a test account on the site. Start a Plus checkout (`plan: "plus"`) and pay with Creem's test card.
2. In the admin, open **Billing events**, choose "All recent events". You should see `checkout.completed` and `subscription.paid` as `processed`.
   Check the person now has 3,000 credits (Users, Credits) and that their status is `active`.
3. Press **Raw** on each event and compare with `docs.creem.io` webhook examples. This code was written from those examples, not from a live payload;
   if a field is named differently, the event shows up as `needs_review` or `error` with a note, and it is a small fix.
4. Buy a top-up. The credits go up by the pack size, once.
5. As a second test account that signed up through a partner link (`?ref=CODE`), buy Plus. The partner's hub should show a pending commission of 20% of $12.
6. Refund the payment from the Creem dashboard. The commission should show as reversed and the credits should be gone.
7. Creem's "Send test event" button produces events with no Fluency AI user in them. Those correctly show as `needs_review`; that is expected.

## When the dashboard asks for you

- **Refund of a top-up:** Creem's refund event does not say which top-up it was. Take the credits back: Users, Credits, enter a negative number
  (for example `-500`). Only top-up credits are taken, never below zero. Then press **Done**.
- **Partial refund:** nothing changes automatically. Decide whether the person keeps access, then press **Done**.
- **Refund after the partner was already paid:** recover it from the partner or take it off their next payout.
- **Chargeback:** respond to the dispute in Creem. The commission is already reversed and the monthly credits ended.
- **An event with no user:** a checkout created outside the site or app. Find the person and give them what they paid for by hand.

## What is not done

- `CREDITS_MODE=enforce` is still off. It is safe only when the Flutter app also sends the login token with every AI request.
  The billing side is now ready (subscribers get their credits).
- The Flutter paywall still sells the old weekly, yearly and lifetime products. Those still work, but give no credits. They are removed with the Flutter rework.
- The referred-buyer discount on app subscriptions is not built (Creem discount codes would do it). The commission is calculated on the product price.
- The site has no buy button yet: until the app is launched, nothing links to checkout.
- Plans changed inside Creem (upgrades, a second plan) are not handled: there is one plan.
