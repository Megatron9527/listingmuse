# ListingMuse UI Wireframes (Polaris)

This document describes screens for a Shopify Admin embedded app using Polaris components.

Navigation (App Bridge):
- Dashboard
- Generate
- Batch
- History
- Usage
- Settings
- Billing

Embedded notes:
- Preserve `shop` and `host` query params on internal links.
- Use App Bridge Redirect for external navigation (OAuth, billing portal).

## 1. Install / Re-auth
Purpose: Handle OAuth redirect states.

Components:
- `Page` with `Banner` (info/error)
- `Spinner`
- Minimal content; redirects back into Admin once authenticated.

## 2. Onboarding
Purpose: First-run guidance.

Layout:
- `Page` + `Layout` with 2 columns

Left (steps):
- `Card` -> `List`
  - Connect store (complete)
  - Choose plan (required)
  - First generation (CTA)

Right (plan and permissions):
- `Card` -> `Text` explaining scopes
- `CalloutCard` linking to Billing

## 3. Dashboard
Purpose: Status overview and shortcuts.

Components:
- `Page` title: ListingMuse
- `Layout`
- `Card` KPI row: Credits remaining, Generations this week, Apply rate
- `Card` Recent activity: `DataTable` of latest generations (status, product, time)
- `Card` Getting started: CTAs

## 4. Generate (Single)
Purpose: Generate for one product.

Top bar:
- `Page` + primary action `Generate`
- Secondary action `Reset`

Main sections:
1) Product selector
- `Card` with `Autocomplete` / `ResourcePicker`-style UX (implemented via API)
- Selected product summary (`Thumbnail`, title, vendor, status)

Entry points:
- In-app: Generate page (primary)
- Admin extension: Product details extension (secondary)

## 4a. Admin Product Details Extension (Optional, Recommended)
Purpose: Let a merchant run ListingMuse from a product context.

Surface:
- Shopify Admin UI extension on product details page

Components:
- Compact `Card`
- Product summary (`Thumbnail`, title)
- Options mini-form (tone/length)
- Primary `Button`: Generate
- Inline status (`Badge` + `Spinner`)
- Deep link button: "Open in ListingMuse" (keeps `shop` + `host`)

2) Input options
- `Card` with `FormLayout`
  - Tone: `Select` (Neutral, Friendly, Premium, Playful)
  - Length: `ChoiceList` (Short/Medium/Long)
  - SEO: `Checkbox`
  - Include existing copy: `Checkbox`
  - Template: `Select` (Default, Apparel, Beauty, Home)

3) Preview output
- `Card` with tabs: Attributes, Copy, SEO, Images
- Attributes tab
  - `DescriptionList` for key fields
  - Confidence badges (`Badge` with tone)
  - `Text` callouts for uncertain fields
- Copy tab
  - Title `TextField`
  - Bullets `TextField` (multiline)
  - Description `TextField` (multiline, rich text preview optional)
- SEO tab
  - `TextField` for SEO title/description
- Images tab
  - `ResourceList` of images with suggested alt text

4) Apply controls
- `Card` with per-field toggles
  - `Checkbox` list of fields to apply
- Primary CTA `Apply to Shopify`
- Confirmation modal: `Modal` with summary and warnings

## 5. Batch
Purpose: Generate for many products asynchronously.

Sections:
1) Product selection
- `Card` filters
  - Search query
  - Status filter
  - Missing fields filter (e.g., no description)
- `IndexTable` of products with selection
- `Pagination`

2) Batch options
- Same options as single generate
- `Button` primary: `Start batch`

3) Batch run status
- `Card` with `ProgressBar`
- `IndexTable` of items (product, status, errors)
- Actions: Retry failed, Cancel batch

4) Bulk approval + apply
- `Card` showing generated results per product
- Bulk select fields to apply
- `Button` primary: Apply selected

## 6. History
Purpose: Review past generations.

Components:
- `Page`
- Filters: status/date/product search
- `IndexTable` rows open a details view

Details view (drawer or page):
- Input summary
- Output tabs (same as preview)
- Apply/rollback actions (if supported)

## 7. Usage
Purpose: Transparent credit usage.

Components:
- `Card` cycle summary (start/end)
- `Card` credits remaining + spend chart (optional)
- `IndexTable` ledger entries

## 8. Billing
Purpose: Plan selection and portal.

Components:
- `Page`
- Plan cards: `Card` + price + included credits
- `Button` -> Checkout
- `Button` -> Manage subscription (portal)
- `Banner` for past due/canceled

## 9. Settings
Purpose: App behavior configuration.

Sections:
- Defaults
  - Default tone/length/template
  - Default apply fields
- Safety
  - Prohibited claims toggles (e.g., medical claims)
  - Brand glossary / allowed terms (optional)
- Webhooks/debug
  - Last webhook status, retry controls (admin-only)
