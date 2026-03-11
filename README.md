# ListingMuse

Shopify embedded app (Remix + Node/TypeScript) for generating product listing attributes and copy from images, with batch workflows, usage tracking, and Lemon Squeezy billing.

This repository currently contains product/spec documentation to guide implementation.

## Spec Pack
- `PRD.md`
- `DB_SCHEMA.md`
- `API_SPEC.md`
- `UI_WIREFRAMES.md`
- `AI_SPEC.md`

## Local Development Plan (Target Stack)

### Prereqs
- Node.js (LTS)
- Postgres 14+
- Shopify Partner account + dev store
- Shopify CLI
- Lemon Squeezy account (product + variant + webhooks)

### Environment variables
Example (names are suggestions; align to your framework once implemented):

```bash
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_SCOPES=read_products,write_products
SHOPIFY_APP_URL=https://your-tunnel-url
SHOPIFY_IS_EMBEDDED=true

DATABASE_URL=postgres://...

LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=

AI_PROVIDER=openai
AI_API_KEY=
```

### Run locally (planned)
1) Start Postgres and apply schema/migrations.
2) Start a tunnel (Cloudflare Tunnel / ngrok) to expose the local Remix server.
3) Configure the Shopify app URL to the tunnel URL.
4) Run the dev server and install the app on a dev store.
5) Configure Shopify webhooks (app/uninstalled + privacy).
6) Configure Lemon Squeezy webhooks to `POST /webhooks/lemonsqueezy`.

Embedded reminders:
- In the embedded iframe, use App Bridge for redirects (OAuth/billing) and preserve `shop` + `host`.
- Verify webhooks using raw request body signatures (Shopify HMAC; Lemon Squeezy `X-Signature`).

## Deployment Notes (planned)

### Hosting
- Host Remix app on a Node-compatible platform (Fly.io, Render, Heroku, AWS).
- Postgres as managed DB.

### Webhooks
- Ensure stable public HTTPS URL.
- Verify signatures for Shopify and Lemon Squeezy.
- Implement idempotency using a `webhooks` table.

### Data and Security
- Encrypt Shopify tokens at rest.
- Restrict Shopify scopes to the minimum needed.
- Keep an immutable `audit_log` of apply operations.

## Implementation Checklist
- Follow `API_SPEC.md` for routes.
- Follow `DB_SCHEMA.md` for tables and indexes.
- Follow `UI_WIREFRAMES.md` for Polaris screen composition.
- Follow `AI_SPEC.md` for JSON outputs and prompt rules.
