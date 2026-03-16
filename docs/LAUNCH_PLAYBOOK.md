# ListingMuse – Launch Playbook (MVP: acquisition → conversion → revenue)

This is a **minimum** playbook to get the app **listed, installed, paid, and verified**.

## 0) Definition of “Done” (launch-ready)

You are launch-ready when:

- ✅ Dev store **install works**
- ✅ You can start checkout from `/app/billing`
- ✅ LemonSqueezy sends webhook → app receives it (`/webhooks/lemonsqueezy`) with **valid signature**
- ✅ Billing record updates to `active` (or valid cancelled w/ remaining period)
- ✅ Gated endpoints are unlocked:
  - `POST /app/api/generate`
  - `POST /app/api/apply`

## 1) Required configuration

### 1.1 Environment variables

Set these in your deployment (and locally for dev):

- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_VARIANT_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`

If any is missing, checkout will not start.

### 1.2 LemonSqueezy webhook setup

In LemonSqueezy, set a webhook endpoint:

- URL: `<YOUR_SHOPIFY_APP_URL>/webhooks/lemonsqueezy`
- Secret: must match `LEMONSQUEEZY_WEBHOOK_SECRET`

Important:
- This app expects webhook payloads to include `meta.custom_data.shopDomain` (passed from checkout).

## 2) End-to-end verification checklist (Dev store)

### Step A — Install

1. Start app dev server (`npm run dev` in `app/listingmuse`)
2. Install on a Shopify **development store**
3. Open embedded app

### Step B — Checkout

1. Go to `/app/billing`
2. Click **Start checkout**
3. Complete checkout in the new tab

Expected:
- Billing page begins polling for activation.

### Step C — Webhook delivery

Verify webhook delivery by:

- Checking your server logs for `/webhooks/lemonsqueezy`
- Checking database table `WebhookEvent` status transitions:
  - `RECEIVED` → `PROCESSED`

Expected:
- `billing.status` becomes `active` (or `cancelled` with a `currentPeriodEnd` in the future)

### Step D — Unlock

1. Back in embedded app, go to Generate
2. Try Generate + Apply

Expected:
- No `402 payment_required` responses

## 3) Local webhook test (without LemonSqueezy UI)

Use the helper script to send a **signed** webhook to your local server.

- Script: `tools/send-test-lemonsqueezy-webhook.mjs`

Example:

```bash
cd listingmuse
export LEMONSQUEEZY_WEBHOOK_SECRET="..."
node tools/send-test-lemonsqueezy-webhook.mjs \
  --url http://localhost:3000/webhooks/lemonsqueezy \
  --shop your-dev-shop.myshopify.com
```

This validates:
- signature verification
- payload parsing
- billing upsert
- webhookEvent persistence

## 4) First 20 paid customers – minimal acquisition loop

### Target user

- Solo store owners or small teams
- Have 50–5,000 products
- Already using Shopify, want faster “good enough” product copy

### Positioning

- “Turn messy product pages into **conversion-ready listings** in minutes.”
- “Batch cleanups for catalogs.”

### Channels (pick 1–2 only)

1. **Shopify communities** (forums + FB groups)
2. **Cold DM** to stores with obviously weak product descriptions
3. **Upwork/Fiverr** sellers: offer it as a tool that speeds up their workflow

### Outreach script (short)

> Hey — I noticed a few of your product pages have very short/duplicated descriptions.
> I’m building a Shopify app that generates better titles + descriptions + bullets and lets you apply back to Shopify in one click.
> If you want, I can run 3 of your products and show before/after (no obligation). Interested?

### Conversion script

- Offer a **single quick win** first (3 products)
- Then:

> If this saves you time weekly, the Pro plan unlocks unlimited generation + apply + batch workflows.

### What to track (daily)

- # conversations started
- # stores installed
- # checkouts started
- # paid
- top objection + your reply

## 5) Common failure modes

- Checkout starts but access never unlocks → webhook not delivered / wrong secret / app URL mismatch
- Webhook received but shop not mapped → missing `meta.custom_data.shopDomain`
- Billing shows cancelled but still within period → should remain active until `currentPeriodEnd`

