import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  getBillingForShopId,
  isBillingCurrentlyActive,
  paymentRequiredResponse,
} from "../billing/billing.server";
import { authenticate } from "../shopify.server";

type ApplyRequest = {
  productId?: unknown;
  generationId?: unknown;
  generated?: unknown;
};

type ListingDraft = {
  title?: unknown;
  descriptionHtml?: unknown;
  tags?: unknown;
  seo?: unknown;
};

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductUpdateResponse = {
  data?: {
    productUpdate?: {
      product?: { id: string; title: string; tags?: string[] } | null;
      userErrors?: Array<{ field?: string[]; message: string }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

const jsonResponse = (body: unknown, init?: ResponseInit) => {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
};

const coerceString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const coerceStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return items;
};

const extractNumericId = (gidOrId: string) => {
  const m = gidOrId.match(/(\d+)$/);
  return m?.[1] ?? null;
};

const toProductGid = (productIdInput: string) => {
  const numericId = extractNumericId(productIdInput);
  if (numericId) return `gid://shopify/Product/${numericId}`;
  return productIdInput;
};

const ensureShop = async (shopDomain: string) => {
  return prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: {},
  });
};

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return !!v && typeof v === "object" && !Array.isArray(v);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return jsonResponse(
    { ok: false, error: "Method not allowed" },
    { status: 405 },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const shop = await ensureShop(session.shop);
  const billing = await getBillingForShopId(shop.id);
  const active = isBillingCurrentlyActive(
    billing
      ? {
          status: billing.status,
          currentPeriodEnd: billing.currentPeriodEnd ?? null,
        }
      : null,
  );
  if (!active) {
    return paymentRequiredResponse({
      status: billing?.status ?? null,
      currentPeriodEnd: billing?.currentPeriodEnd ?? null,
    });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { ok: false, error: "Expected application/json" },
      { status: 415 },
    );
  }

  let payload: ApplyRequest;
  try {
    payload = (await request.json()) as ApplyRequest;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const productIdInput = coerceString(payload.productId);
  if (!productIdInput) {
    return jsonResponse(
      { ok: false, error: "Missing productId" },
      { status: 400 },
    );
  }

  const generationId = coerceString(payload.generationId);

  // Load listing
  let listingUnknown: unknown = payload.generated;
  if (listingUnknown == null && generationId) {
    const gen = await prisma.generation.findUnique({
      where: { id: generationId },
    });
    if (!gen) {
      return jsonResponse(
        { ok: false, error: "generationId not found" },
        { status: 404 },
      );
    }
    listingUnknown = gen.outputJson;
  }

  if (!isRecord(listingUnknown)) {
    return jsonResponse(
      { ok: false, error: "Missing generated listing" },
      { status: 400 },
    );
  }

  const listing = listingUnknown as ListingDraft;

  const title = coerceString(listing.title);
  const descriptionHtml = coerceString(listing.descriptionHtml);
  const tags = coerceStringArray(listing.tags) ?? [];

  let seoTitle: string | null = null;
  let seoDescription: string | null = null;
  if (isRecord(listing.seo)) {
    seoTitle = coerceString(listing.seo.title);
    seoDescription = coerceString(listing.seo.description);
  }

  if (
    !title &&
    !descriptionHtml &&
    tags.length === 0 &&
    !seoTitle &&
    !seoDescription
  ) {
    return jsonResponse(
      { ok: false, error: "Nothing to apply" },
      { status: 400 },
    );
  }

  const productGid = toProductGid(productIdInput);

  // Apply to Shopify
  const resp = await (admin as unknown as AdminClient).graphql(
    `#graphql
    mutation ProductUpdateForListingMuse($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          tags
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          id: productGid,
          ...(title ? { title } : {}),
          ...(descriptionHtml ? { descriptionHtml } : {}),
          ...(tags ? { tags } : {}),
          ...(seoTitle || seoDescription
            ? {
                seo: {
                  ...(seoTitle ? { title: seoTitle } : {}),
                  ...(seoDescription ? { description: seoDescription } : {}),
                },
              }
            : {}),
        },
      },
    },
  );

  const json = (await resp.json()) as ProductUpdateResponse;
  const userErrors = json.data?.productUpdate?.userErrors ?? [];
  if (userErrors.length) {
    return jsonResponse(
      { ok: false, error: "Shopify productUpdate failed", userErrors },
      { status: 400 },
    );
  }
  if (json.errors?.length) {
    return jsonResponse(
      { ok: false, error: json.errors[0]?.message ?? "Shopify GraphQL error" },
      { status: 400 },
    );
  }

  const updatedProduct = json.data?.productUpdate?.product ?? null;

  // Audit log
  const audit = await prisma.auditLog.create({
    data: {
      shopId: shop.id,
      action: "APPLY_GENERATED_LISTING",
      entityType: "Product",
      entityId: productGid,
      generationId: generationId ?? undefined,
      details: {
        productId: productGid,
        applied: {
          title: title ?? undefined,
          descriptionHtml: descriptionHtml ?? undefined,
          tags,
          seo: {
            title: seoTitle ?? undefined,
            description: seoDescription ?? undefined,
          },
        },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const auditLogId = `audit_${randomUUID()}`;

  return jsonResponse({
    ok: true,
    appliedToProductId: productGid,
    shopifyProduct: updatedProduct,
    auditLogId,
    audit: {
      id: audit.id,
      createdAt: audit.createdAt.toISOString(),
    },
  });
};
