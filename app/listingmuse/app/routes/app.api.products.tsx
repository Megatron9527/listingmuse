import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductSearchResponse = {
  data?: {
    products?: {
      nodes?: Array<{
        id: string;
        title: string;
        status?: string | null;
        totalInventory?: number | null;
        featuredImage?: { url?: string | null } | null;
      }>;
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

const sanitizeQuery = (query: string | null) => {
  const trimmed = (query ?? "").trim();
  if (!trimmed) return "status:active";
  return `${trimmed} status:active`;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const query = sanitizeQuery(url.searchParams.get("q"));

  const resp = await (admin as unknown as AdminClient).graphql(
    `#graphql
    query ListingMuseProductPicker($query: String!) {
      products(first: 8, query: $query, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          status
          totalInventory
          featuredImage {
            url
          }
        }
      }
    }`,
    { variables: { query } },
  );

  const json = (await resp.json()) as ProductSearchResponse;
  if (json.errors?.length) {
    return jsonResponse(
      { ok: false, error: json.errors[0]?.message ?? "Product search failed" },
      { status: 400 },
    );
  }

  const products = (json.data?.products?.nodes ?? []).map((product) => ({
    id: product.id,
    title: product.title,
    status: product.status ?? null,
    totalInventory: product.totalInventory ?? null,
    imageUrl: product.featuredImage?.url ?? null,
  }));

  return jsonResponse({ ok: true, products });
};
