# ListingMuse API Spec (REST + Webhooks)

All endpoints are intended to be implemented in a Shopify Remix app (Node/TypeScript). Routes below are described as HTTP paths; actual Remix route file layout may differ.

Conventions:
- JSON request/response unless noted.
- Authentication: Shopify session-based auth; requests are scoped to the current `shop_id`.
- Idempotency: webhook processing must be idempotent using `webhooks` table.

## Auth (Shopify OAuth / Embedded)

This spec assumes using `@shopify/shopify-app-remix` with `isEmbeddedApp: true`.

Key embedded constraints:
- App navigation and external redirects should use App Bridge (top-level redirect) when required.
- Always preserve `shop` and `host` query params when linking within the embedded app.

### GET /auth
Starts OAuth (authorization code grant), typically implemented as a Remix "splat" auth route.

Query:
- `shop` (required): shop domain

Behavior:
- Validates `shop` domain format.
- Redirects to Shopify authorization URL with required scopes.

### GET /auth/callback
Completes OAuth.

Query:
- `shop`, `code`, `state`, `host` (as provided by Shopify)

Behavior:
- Validates `state`.
- Exchanges code for token.
- Stores offline token for shop-wide access; optionally stores online token for user attribution.
- Ensures `shops` row exists/updated.
- Redirects into embedded app within Shopify Admin (escape iframe / top-level redirect as required).

Implementation notes:
- Offline tokens are preferred for background work (batch, webhooks). Online tokens carry `associated_user` and expire.
- Shopify session tokens are short-lived; fetch fresh tokens client-side as needed.

### POST /auth/logout
Ends app session for the current user.

## Products

### GET /api/products
Lists products.

Query:
- `q` (optional): search
- `cursor` (optional): pagination cursor
- `limit` (optional, default 25)

Response:
```json
{
  "items": [
    {
      "shopifyProductGid": "gid://shopify/Product/123",
      "title": "...",
      "handle": "...",
      "vendor": "...",
      "productType": "...",
      "status": "ACTIVE",
      "imageUrls": ["..."],
      "tags": ["..."]
    }
  ],
  "nextCursor": "..."
}
```

### GET /api/products/:shopifyProductGid
Returns a product snapshot used for generation/apply previews.

## Generations

### POST /api/generations
Creates a generation job.

Request:
```json
{
  "mode": "single",
  "product": {
    "shopifyProductGid": "gid://shopify/Product/123",
    "imageUrls": ["https://..."],
    "existing": {
      "title": "...",
      "descriptionHtml": "...",
      "tags": ["..."],
      "vendor": "...",
      "productType": "..."
    }
  },
  "options": {
    "tone": "confident",
    "length": "medium",
    "seo": true,
    "language": "en",
    "template": "default"
  }
}
```

Response:
```json
{ "generationId": "uuid", "status": "queued" }
```

Behavior:
- Enforces shop plan/credits before enqueue.
- Writes `generations` + `usage_ledger` (reservation or charge depending on policy).

### POST /api/generations/batch
Creates a batch generation job.

Request:
```json
{
  "productIds": ["gid://shopify/Product/123"],
  "options": { "tone": "friendly", "seo": true }
}
```

Response:
```json
{ "batchId": "uuid", "enqueued": 100 }
```

Implementation note:
- Batch can be represented as a parent `generations` record (mode `batch`) with child generation records, or as a separate table if desired.

### GET /api/generations
Lists recent generations.

Query:
- `status` (optional)
- `cursor` (optional)
- `limit` (optional)

### GET /api/generations/:id
Returns generation request/result.

### POST /api/generations/:id/cancel
Cancels a queued/running generation (best-effort).

## Apply

### POST /api/apply
Applies approved fields from a generation result back to Shopify.

Request:
```json
{
  "generationId": "uuid",
  "product": { "shopifyProductGid": "gid://shopify/Product/123" },
  "apply": {
    "title": true,
    "descriptionHtml": true,
    "tags": true,
    "vendor": false,
    "productType": false,
    "seoTitle": true,
    "seoDescription": true,
    "imageAltText": true
  }
}
```

Response:
```json
{ "applied": true, "shopifyProductGid": "gid://shopify/Product/123" }
```

Behavior:
- Validates generation belongs to shop and is succeeded.
- Fetches current Shopify product state (for optimistic checks + rollback snapshot).
- Updates only selected fields.
- Writes `usage_ledger` (apply charge if applicable) + `audit_log`.

### POST /api/apply/batch
Applies many generation results.

Request:
```json
{
  "items": [
    { "generationId": "uuid", "shopifyProductGid": "gid://shopify/Product/123", "apply": { "title": true, "descriptionHtml": true } }
  ]
}
```

Response:
```json
{
  "results": [
    { "generationId": "uuid", "shopifyProductGid": "gid://shopify/Product/123", "status": "applied" }
  ]
}
```

## Usage

### GET /api/usage
Returns current cycle usage and plan limits.

Response:
```json
{
  "plan": { "name": "Starter", "includedCredits": 500 },
  "cycle": { "start": "2026-01-01T00:00:00Z", "end": "2026-02-01T00:00:00Z" },
  "credits": { "used": 123, "remaining": 377 }
}
```

### GET /api/usage/ledger
Lists usage ledger entries.

## Billing

### POST /api/billing/checkout
Creates a Lemon Squeezy checkout session for the current shop.

Request:
```json
{ "variantId": "ls_variant_id" }
```

Response:
```json
{ "checkoutUrl": "https://..." }
```

### GET /api/billing/portal
Returns a Lemon Squeezy customer portal URL.

## Webhooks

### POST /webhooks/shopify
Receives Shopify webhooks.

Headers:
- `X-Shopify-Topic`
- `X-Shopify-Shop-Domain`
- `X-Shopify-Hmac-Sha256`

Topics to support (minimum):
- `APP_UNINSTALLED`
- Privacy webhooks as required by Shopify (e.g., customer data requests/redaction)

Behavior:
- Verify signature (requires raw request body).
- Upsert `webhooks` delivery row; ignore duplicates.
- For `APP_UNINSTALLED`: mark `shops.is_active=false`, set `uninstalled_at`, revoke tokens best-effort.

Operational notes:
- Respond quickly (queue heavy work) to avoid retries/timeouts.

Remix implementation note:
- Prefer using the framework helper that verifies signatures and returns `{ topic, payload, webhookId, session }`.
- Webhooks can arrive after uninstall; handle missing sessions gracefully.

### POST /webhooks/lemonsqueezy
Receives Lemon Squeezy webhooks.

Headers:
- `X-Event-Name` (event type)
- `X-Signature` (HMAC SHA-256 hex digest)

Behavior:
- Verify signature against raw request body using `X-Signature`.
- Persist payload and processing results in `webhooks`.
- Update `subscriptions` and `shops.billing_status`.
- Grant included credits at period start (writes `usage_ledger` as `subscription_grant`).

Recommended Lemon Squeezy events:
- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_expired`
- `subscription_payment_success`
- `subscription_payment_failed`
- `subscription_payment_recovered`
- `subscription_payment_refunded`

## Errors
Standard error shape:
```json
{ "error": { "code": "string", "message": "string", "requestId": "string" } }
```
