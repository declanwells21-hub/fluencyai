# Selar orders and partner commissions

Exam blueprints are sold on Selar. Every sale Selar reports to the site lands in the admin dashboard
(**Exam blueprint orders (Selar)**), and a sale that carries a partner's code earns that partner 20%.

## How it works

1. Selar sends each completed order to `https://fluencyai.app/api/selar-order?key=<SELAR_WEBHOOK_SECRET>`
   (a rewrite to `api/referral.js`, because the project is at Vercel's 12-function limit).
2. The order is **stored exactly as it arrived** (`selar_orders.raw`) before anything is interpreted.
3. The receiver looks for a partner code in three places, in this order: a `ref`-type field, a coupon-type field,
   and any link in the payload containing `?ref=`. The first code that belongs to an **active** partner wins.
4. The amount is turned into US dollars (see below) and the commission is recorded with the normal 14-day refund hold.
5. If no code is found, the order waits as **Needs a partner**. You assign it by hand (Assign). No commission is ever paid on a guess.

Duplicate deliveries are harmless (same Selar order id = same order). A refund notification reverses the commission
if it has not been paid out yet.

## Order statuses

| Status | Meaning | What to do |
|---|---|---|
| Commission | A commission exists and is in the 14-day hold. | Nothing. |
| Needs a partner | No partner code found, or the code matches nobody. | Press **Assign**, enter the partner's code. |
| Needs a dollar amount | A code was found but the dollar amount is not trustworthy (other currency with no rate, or a suspiciously large amount). | Press **Assign**, enter the code and the dollars the buyer paid. |
| Own purchase | The buyer is the partner. | Nothing. |
| Ignored | Pending or failed payment, or a zero amount. | Nothing. |
| Refunded | Refunded. The note says whether the commission was reversed or had already been paid. | If already paid, recover it or take it off the next payout. |
| Error | Something failed while processing. | Selar's retry fixes most; otherwise press **Assign**. |

## What is certain about Selar, and what is not

Selar's help centre says it can send every completed order to a URL (buyer name and email, product, amount paid, order
id). **Nothing public says Selar hands back a `?ref=` from the buyer's link, tells us which coupon was used, or signs its
requests.** The handoff assumed `?ref=` comes back; that is unproven. So:

- Authentication is the secret key in the URL. Keep it private; if it leaks, change `SELAR_WEBHOOK_SECRET` and the URL in Selar.
- Which of the attribution routes works is learned from the first real test purchase (below). Until then, expect some
  orders to need **Assign**.

### The discount for referred buyers

The Partners page promises referred buyers "an exclusive discount at checkout". On Selar that can only be a **coupon**.
The cleanest design is one coupon per partner whose code is the partner's own code (for example `AMARA20`, 10% off,
all exam blueprints). Then the same coupon gives the buyer the discount **and** identifies the partner, if Selar
reports the coupon in the order. This needs a manual step per partner (create the coupon in Selar) and a decision
on the discount size. Not built yet: see "Decisions".

## Switching it on

1. Supabase SQL editor: run `scripts/supabase_migration_selar.sql` (after the partner hub file), then `scripts/selar_self_test.sql`.
   Success is `ERROR: ALL 9 CHECKS PASSED. Everything was rolled back.`
2. Vercel environment variables: `SELAR_WEBHOOK_SECRET` (a long random string, e.g. 40 characters) and, if you sell in
   other currencies, `SELAR_USD_RATES`. Redeploy.
3. In Selar, open **Settings, Integrations** (the Zapier / webhook page) and paste
   `https://fluencyai.app/api/selar-order?key=<your secret>` as the webhook URL.
   - If Selar refuses a URL that is not from Zapier, use a free Zapier "Catch Hook" in between:
     Selar sends to Zapier, and a Zapier "Webhooks, POST" step sends to the same URL. The receiver accepts either.
4. **Test purchase** (do this before telling any partner it works):
   - Make a partner with a known code (for example `TEST20`) and, in Selar, a coupon `TEST20`.
   - Buy the cheapest guide yourself **three times**, from a different email than the partner's:
     (a) through `https://fluencyai.app/store` from a link that carries `?ref=TEST20`,
     (b) typing the coupon `TEST20` at Selar's checkout, and
     (c) with no code at all.
   - In the dashboard open each order and press **Raw**. This shows exactly what Selar sent.
     Check: which order id field, whether the amount and currency are readable, and whether the code appeared
     (in a ref field, as the coupon, or not at all).
   - Send me the three raw payloads. If the field names differ from what the receiver expects, it is a small change.
5. Refund test: refund one test order in Selar and check it shows **Refunded** (if Selar does not notify refunds, use the
   **Refunded** button on the order).

## Money

Commission is 20% of the **US-dollar amount the buyer paid** (so a discounted sale pays commission on the discounted price).
If Selar reports another currency, the amount is converted with `SELAR_USD_RATES` and the rate used is stored on the
order. These are your own approximate rates: update them now and then. With no rate for that currency the order waits
for a dollar amount.

## Decisions

- **Discount for referred buyers**: how much, and per-partner Selar coupons (manual) or another way.
- **Partner coupon creation**: manual in Selar for each accepted partner. The partner email could include "your buyers' coupon is X"
  once the coupons exist.
- **Privacy Policy**: purchase records from Selar (buyer email, product, amount) are kept for commission accounting. The final
  policy text does not mention this yet; it should.
