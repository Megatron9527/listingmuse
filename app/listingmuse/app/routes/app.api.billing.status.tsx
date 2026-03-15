import type { LoaderFunctionArgs } from "react-router";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
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

  return jsonResponse({
    ok: true,
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
  });
};
