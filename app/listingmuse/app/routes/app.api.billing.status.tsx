import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  getBillingForShopId,
  isBillingCurrentlyActive,
  jsonResponse,
} from "../billing/billing.server";
import { getLemonSqueezyEnv } from "../billing/lemonSqueezy.server";
import { authenticate } from "../shopify.server";

const ensureShop = async (shopDomain: string) => {
  return prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: {},
  });
};

const getStatusPayload = async (request: Request) => {
  const { session } = await authenticate.admin(request);
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

  const env = getLemonSqueezyEnv();

  return {
    ok: true as const,
    shopDomain: session.shop,
    configured: Boolean(
      env.storeId && env.apiKey && env.variantId && env.webhookSecret,
    ),
    active,
    billing: billing
      ? {
          status: billing.status,
          currentPeriodEnd: billing.currentPeriodEnd
            ? billing.currentPeriodEnd.toISOString()
            : null,
          cancelAt: billing.cancelAt ? billing.cancelAt.toISOString() : null,
          provider: billing.provider,
          lemonsqueezySubscriptionId: billing.lemonsqueezySubscriptionId,
          lemonsqueezyVariantId: billing.lemonsqueezyVariantId,
        }
      : null,
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return jsonResponse(await getStatusPayload(request));
};

// Useful for client-side polling after redirecting back from checkout.
export const action = async ({ request }: ActionFunctionArgs) => {
  return jsonResponse(await getStatusPayload(request));
};
