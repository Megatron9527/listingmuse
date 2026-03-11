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
