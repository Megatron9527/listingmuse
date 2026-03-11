# ListingMuse AI Spec

Goals:
- Produce structured, defensible product attributes from images and existing product inputs.
- Generate high-quality listing copy that is accurate, non-deceptive, and consistent with merchant preferences.

## 1) Image -> Attributes JSON Schema

The model must return a single JSON object matching this schema.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ListingMuseProductAttributes",
  "type": "object",
  "required": ["core", "confidence", "evidence", "warnings"],
  "additionalProperties": false,
  "properties": {
    "core": {
      "type": "object",
      "required": ["suggestedTitle", "productType", "vendor", "tags", "highlights", "descriptionFacts"],
      "additionalProperties": false,
      "properties": {
        "suggestedTitle": { "type": "string", "minLength": 5, "maxLength": 140 },
        "vendor": { "type": "string", "maxLength": 80 },
        "productType": { "type": "string", "maxLength": 80 },
        "categoryPath": { "type": "array", "items": { "type": "string" }, "maxItems": 6 },
        "materials": { "type": "array", "items": { "type": "string" }, "maxItems": 10 },
        "colors": { "type": "array", "items": { "type": "string" }, "maxItems": 8 },
        "pattern": { "type": "string", "maxLength": 60 },
        "size": { "type": "string", "maxLength": 40 },
        "dimensions": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "unit": { "type": "string", "enum": ["cm", "in"] },
            "length": { "type": "number" },
            "width": { "type": "number" },
            "height": { "type": "number" },
            "weight": { "type": "number" }
          }
        },
        "condition": { "type": "string", "enum": ["new", "like_new", "used_good", "used_fair", "unknown"] },
        "styleTags": { "type": "array", "items": { "type": "string" }, "maxItems": 15 },
        "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 30 },
        "highlights": { "type": "array", "items": { "type": "string" }, "minItems": 3, "maxItems": 7 },
        "descriptionFacts": { "type": "array", "items": { "type": "string" }, "minItems": 5, "maxItems": 20 },
        "defects": { "type": "array", "items": { "type": "string" }, "maxItems": 10 },
        "imageAltText": { "type": "array", "items": { "type": "string" }, "maxItems": 20 }
      }
    },
    "confidence": {
      "type": "object",
      "required": ["overall", "fields"],
      "additionalProperties": false,
      "properties": {
        "overall": { "type": "number", "minimum": 0, "maximum": 1 },
        "fields": {
          "type": "object",
          "additionalProperties": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "evidence": {
      "type": "object",
      "required": ["usedImages"],
      "additionalProperties": false,
      "properties": {
        "usedImages": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["index", "reason"],
            "additionalProperties": false,
            "properties": {
              "index": { "type": "integer", "minimum": 0 },
              "reason": { "type": "string", "maxLength": 200 }
            }
          },
          "maxItems": 20
        },
        "notes": { "type": "array", "items": { "type": "string" }, "maxItems": 10 }
      }
    },
    "warnings": { "type": "array", "items": { "type": "string" }, "maxItems": 10 }
  }
}
```

Validation rules:
- JSON only (no markdown, no trailing commentary).
- Use `unknown`/omit when uncertain; do not invent brand/material claims.
- `imageAltText` should align 1:1 with provided images where possible.

## 2) Prompt Templates

### A) Attributes extraction (vision)
System:
- You extract only what is visible or explicitly provided.
- You never guess brand/model/material if not clearly evidenced.
- Return JSON matching the schema. No extra keys.

User (template):
```text
You are ListingMuse. Extract product attributes for a Shopify listing.

Inputs:
- Existing product data (may be incomplete):
  - Title: {{existing_title}}
  - Vendor: {{existing_vendor}}
  - Product type: {{existing_product_type}}
  - Tags: {{existing_tags_csv}}
  - Description: {{existing_description_plain}}

Task:
1) Use the images as primary evidence.
2) Fill the JSON schema fields.
3) If a field is not supported by evidence, leave it empty or set condition to "unknown".
4) Add warnings for any uncertainty or potential compliance issues.

Return JSON only.
```

### B) Listing copy generation
System rules:
- Accuracy first; no unverifiable claims.
- Avoid medical/regulated claims and superlatives unless provided by merchant.
- Use merchant tone and length settings.
- Output must be compatible with Shopify: HTML allowed for description.

User (template):
```text
You are ListingMuse. Write Shopify product listing copy using the provided structured attributes.

Merchant preferences:
- Tone: {{tone}}
- Length: {{length}}
- SEO: {{seo_enabled}}
- Language: {{language}}

Structured attributes JSON:
{{attributes_json}}

Write:
1) Title (<= 140 chars)
2) 4-6 bullet highlights
3) Description in simple HTML (p, ul, li)
4) Suggested tags (comma-separated)
5) SEO title (<= 70 chars) and SEO description (<= 160 chars)

Hard rules:
- Do not add facts not present in attributes JSON.
- If something important is unknown, omit it and add a brief note in warnings (not in the copy).
```

### C) Safety and consistency checks (optional second pass)
Purpose: detect hallucinations and policy issues.

Template:
```text
Check the proposed copy against the attributes JSON. List any claims not supported by attributes.
Return JSON:
{ "unsupportedClaims": ["..."], "suggestedEdits": ["..."] }
```

## 3) Versioning
- Maintain `prompt_version` in `generations.prompt_version`.
- Log model/provider in `generations` for later quality analysis.
