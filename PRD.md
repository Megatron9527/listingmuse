# ListingMuse PRD

## Overview
ListingMuse is a Shopify embedded app that helps merchants generate high-quality product attributes and marketing copy from product images (and optional existing product data), then apply the results back to Shopify products in bulk.

The app is designed to be implementable with Shopify Remix (Node/TypeScript), Shopify Admin embedded UI (Polaris), and a Postgres backend.

## Goals
- Reduce time to create or improve product listings (title, description, tags, SEO fields) using AI.
- Improve listing quality and consistency (brand, material, color, key features, compliance-friendly claims).
- Enable safe bulk workflows: generate previews first, then apply changes with control and auditability.
- Provide transparent usage + billing using Lemon Squeezy subscriptions.

## Personas
1. Solo merchant
- Runs a small Shopify store; limited time; wants fast, credible copy.
- Success = listing creation time drops; fewer abandoned drafts.

2. Catalog manager (mid-market)
- Maintains hundreds to thousands of SKUs; cares about batch operations and consistency.
- Success = consistent taxonomy and fewer manual edits per SKU.

3. Agency / operator
- Manages multiple stores; needs predictable cost controls and audit trails.
- Success = usage visibility + repeatable workflow.

## User Stories
### Onboarding
- As a merchant, I can install the app and complete Shopify OAuth so the app can read and update products.
- As a merchant, I can choose a plan and see my monthly included usage.

### Generate
- As a merchant, I can select a product and generate suggested attributes (e.g., material, color) and copy (title/description/bullets).
- As a merchant, I can upload additional images for generation.
- As a merchant, I can preview AI output with highlighted uncertainty and sources (which images/inputs were used).

### Apply
- As a merchant, I can apply selected fields back to Shopify (only the fields I approve).
- As a merchant, I can revert an apply operation to the prior Shopify state (best-effort).

### Batch
- As a catalog manager, I can select many products and run batch generation.
- As a catalog manager, I can filter and queue work (e.g., only products missing descriptions).
- As a catalog manager, I can approve/apply results in bulk with per-field overrides.

### Usage and Billing
- As a merchant, I can see my usage this cycle and remaining credits.
- As a merchant, I can upgrade/downgrade/cancel and have the app respond correctly.

### Audit and Compliance
- As an operator, I can see who generated/applied changes and when.
- As an operator, I can see webhook processing and failures.

## Non-Goals
- Marketplace listing publication outside Shopify (e.g., eBay/Etsy/Amazon) in MVP.
- Fully automated, no-review bulk applying (MVP requires human approval).
- Image editing, background removal, or studio tooling.
- Multi-language localization workflows (can be added later).

## Success Metrics
### Activation
- Install-to-first-generation conversion rate.
- Time to first successful apply.

### Retention and Value
- Weekly active shops (WA shops) and repeat generation rate per shop.
- Apply rate: % of generations that are applied.

### Quality
- Merchant edits after apply (proxy: delta between suggested vs final saved text).
- Support tickets per 100 active shops.

### Billing
- Trial-to-paid conversion.
- MRR and churn; plan downgrade rate.

### Reliability
- Webhook success rate; average processing latency.
- Generation error rate; retry success rate.

## Requirements
### Functional
1. Shopify OAuth + Embedded App
- Install flow, re-auth flow, and session storage.
- Store shop domain and access token(s) securely.
- Preserve `shop` and `host` for embedded navigation.

2. Product Ingestion
- List products with search/filter and pagination.
- Fetch product details and associated images.

3. Generation Pipeline
- Create a generation request (single or batch).
- Store inputs and outputs; return a preview to UI.
- Provide structured attributes output (see `AI_SPEC.md`).

4. Apply Pipeline
- Apply approved fields to Shopify product fields (title, description, tags, product type, vendor/brand, SEO fields, images alt text).
- Record an immutable audit entry per apply.
- Best-effort rollback by storing prior values.

5. Batch Processing
- Batch create jobs with per-shop concurrency limits.
- Provide job status and per-product status.

6. Usage + Billing (Lemon Squeezy)
- Track usage in a ledger (credits per generation/apply).
- Enforce quotas by plan.
- React to Lemon Squeezy subscription events via webhooks.

7. Webhooks
- Shopify webhooks: app/uninstalled and required privacy/GDPR webhooks.
- Lemon Squeezy webhooks for subscription lifecycle.
- Idempotent processing with signature verification.

### Non-Functional
- Security: signed webhook verification; token encryption at rest; least-privilege scopes.
- Multi-tenant isolation by `shop_id` in all queries.
- Observability: structured logs + request IDs; webhook event persistence.
- Performance: product list pages load < 2s for 1k-product stores; batch runs asynchronously.
- Cost controls: prompt + image token limits; caching of product image fetch where feasible.

## Milestones
1. MVP (Single-product generate + apply)
- Shopify OAuth, product picker, generate preview, apply approved fields, basic billing + usage.

2. Beta (Batch)
- Batch queue, approval workflow, status dashboard, retry controls.

3. GA (Reliability + UX)
- Robust webhook processing, rollback improvements, better taxonomy controls, onboarding polish.

4. Post-GA
- Advanced templates per category, multi-language, team roles/permissions, integrations.

## Open Questions
- Credit model: per generation, per image, or per applied field? (Spec assumes per-generation with optional per-apply charge.)
- Attribute taxonomy: fixed schema vs per-category schema? (Spec assumes fixed core + extensible attributes.)
- Online vs offline Shopify tokens: do we need per-user online token for attribution? (Spec supports both.)
