# ListingMuse (Phase 1)

This folder contains the app code for ListingMuse, built on Shopify's React Router embedded app template.

## What exists in phase 1

- Pages
  - `/app` - Generate (mock generation + apply)
  - `/app/batch` - Batch (placeholder)
  - `/app/settings` - Settings (placeholder)
- API routes (resource routes)
  - `POST /app/api/generate` - returns mock generated listing JSON from `{ title, imageUrl }`
  - `POST /app/api/apply` - accepts `{ productId, generated }` and returns a mock success + audit payload
- Database schema
  - Prisma schema includes Shopify `Session` (required by PrismaSessionStorage) plus ListingMuse phase-1 models.

## Local development

From the repo root (`app/listingmuse`):

```sh
npm install
npm run prisma -- generate
npm run dev
```

Notes:

- The Prisma datasource uses SQLite with `file:dev.sqlite` as configured in `prisma/schema.prisma`.
- If you need migrations locally, you can create one after changing the schema:

```sh
npm run prisma -- migrate dev --name listingmuse_phase1 --create-only
```

## No secrets

Do not commit `.env` or Shopify credentials. Use Shopify CLI (`npm run dev`) to supply environment values during local development.

## Billing (LemonSqueezy)

ListingMuse includes a small LemonSqueezy billing integration skeleton.

Environment variables (set via Shopify CLI env or your hosting provider):

- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_VARIANT_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`

Endpoints:

- `GET /app/api/billing/status` - returns current billing state for the authenticated shop
- `POST /app/api/billing/checkout` - creates a LemonSqueezy checkout URL for the configured variant
- `POST /webhooks/lemonsqueezy` - receives LemonSqueezy webhooks (signed)

Webhook setup:

- Set the webhook URL to: `<SHOPIFY_APP_URL>/webhooks/lemonsqueezy`
- Configure the signing secret to match `LEMONSQUEEZY_WEBHOOK_SECRET`
- Subscribe to subscription lifecycle events (e.g. `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`)

Notes:

- The checkout creator includes `checkout_data.custom.shopDomain` so webhook events can be mapped back to a Shopify shop.
- `POST /app/api/generate` and `POST /app/api/apply` return HTTP `402` with paywall metadata if no active subscription is present.
