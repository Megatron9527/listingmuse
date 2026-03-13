import type { Prisma } from "@prisma/client";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type GenerateRequest = {
  productId?: unknown;
  title?: unknown;
  imageUrl?: unknown;
};

type ListingDraft = {
  title: string;
  descriptionHtml: string;
  bulletPoints: string[];
  tags: string[];
  seo?: {
    title?: string;
    description?: string;
  };
  images?: string[];
};

type ProductSummary = {
  id: string;
  title: string;
  descriptionHtml?: string | null;
  tags?: string[];
  seo?: { title?: string | null; description?: string | null } | null;
  imageUrl?: string | null;
};

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

type ProductQueryData = {
  data?: {
    product?: {
      id: string;
      title: string;
      descriptionHtml?: string | null;
      tags?: string[];
      seo?: { title?: string | null; description?: string | null } | null;
      featuredImage?: { url: string } | null;
      images?: { nodes?: Array<{ url: string }> } | null;
    } | null;
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

const ensureShop = async (shopDomain: string) => {
  return prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: {},
  });
};

const extractNumericId = (gidOrId: string) => {
  // Accept either a numeric ID or a Shopify GID like gid://shopify/Product/123
  const m = gidOrId.match(/(\d+)$/);
  return m?.[1] ?? null;
};

const getProductSnapshot = async (
  admin: AdminClient,
  shopDomain: string,
  productIdInput: string,
) => {
  const numericId = extractNumericId(productIdInput);
  const gid = numericId
    ? `gid://shopify/Product/${numericId}`
    : productIdInput;

  const resp = await admin.graphql(
    `#graphql
    query ProductForListingMuse($id: ID!) {
      product(id: $id) {
        id
        title
        descriptionHtml
        tags
        seo {
          title
          description
        }
        featuredImage { url }
        images(first: 1) { nodes { url } }
      }
    }`,
    { variables: { id: gid } },
  );

  const json = (await resp.json()) as ProductQueryData;
  const product = json.data?.product ?? null;
  if (!product) {
    return {
      ok: false as const,
      error: json.errors?.[0]?.message ?? "Product not found",
    };
  }

  const imageUrl: string | null =
    product.featuredImage?.url ?? product.images?.nodes?.[0]?.url ?? null;


  const summary: ProductSummary = {
    id: product.id,
    title: product.title,
    descriptionHtml: product.descriptionHtml ?? null,
    tags: product.tags ?? [],
    seo: product.seo ?? null,
    imageUrl,
  };

  const shop = await ensureShop(shopDomain);
  const snapshot = await prisma.productSnapshot.create({
    data: {
      shopId: shop.id,
      productId: product.id,
      title: product.title,
      imageUrl: imageUrl ?? undefined,
      productJson: product as unknown as Prisma.InputJsonValue,
    },
  });

  return { ok: true as const, snapshot, product: summary };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return jsonResponse({ ok: false, error: "Method not allowed" }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { ok: false, error: "Expected application/json" },
      { status: 415 },
    );
  }

  let payload: GenerateRequest;
  try {
    payload = (await request.json()) as GenerateRequest;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const shopDomain = session.shop;
  const productId = coerceString(payload.productId);
  const inputTitle = coerceString(payload.title);
  const inputImageUrl = coerceString(payload.imageUrl);

  const shop = await ensureShop(shopDomain);

  // Optional: fetch snapshot from Shopify if productId provided.
  let productSnapshotId: string | null = null;
  let product: ProductSummary | null = null;
  let resolvedTitle = inputTitle ?? "Untitled product";
  let resolvedImageUrl = inputImageUrl;

  if (productId) {
    const snap = await getProductSnapshot(
      admin as unknown as AdminClient,
      shopDomain,
      productId,
    );
    if (!snap.ok) {
      return jsonResponse({ ok: false, error: snap.error }, { status: 404 });
    }
    productSnapshotId = snap.snapshot.id;
    product = snap.product;
    resolvedTitle = inputTitle ?? snap.snapshot.title ?? resolvedTitle;
    resolvedImageUrl = inputImageUrl ?? snap.snapshot.imageUrl ?? resolvedImageUrl;
  }

  // Phase-2 business logic (still deterministic, but structured)
  const listing: ListingDraft = {
    title: resolvedTitle,
    descriptionHtml: [
      `<p><strong>${resolvedTitle}</strong></p>`,
      `<p>Generated by ListingMuse (phase-2 draft). Review and edit before publishing.</p>`,
    ].join("\n"),
    bulletPoints: [
      "Fast attribute + copy draft generation",
      "Designed for cross-border sellers",
      "Edit tone, claims, and sizing before publishing",
    ],
    tags: ["listingmuse", "generated"],
    seo: {
      title: resolvedTitle,
      description: `Shop-ready draft listing for ${resolvedTitle}`,
    },
    images: resolvedImageUrl ? [resolvedImageUrl] : [],
  };

  const generation = await prisma.generation.create({
    data: {
      shopId: shop.id,
      productSnapshotId: productSnapshotId ?? undefined,
      status: "COMPLETED",
      inputTitle: resolvedTitle,
      inputImageUrl: resolvedImageUrl ?? undefined,
      outputJson: listing as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });

  await prisma.usageLedger.create({
    data: {
      shopId: shop.id,
      generationId: generation.id,
      kind: "GENERATE",
      quantity: 1,
      unit: "generation",
      metadata: {
        source: productId ? "product" : "manual",
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return jsonResponse({ ok: true, generationId: generation.id, product, listing });
};
